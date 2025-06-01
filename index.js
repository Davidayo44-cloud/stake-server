// server/index.js
const express = require("express");
const { Relayer } = require("@openzeppelin/defender-sdk-relay-signer-client");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const mongoose = require("mongoose");
const Suspension = require("./models/suspension");
const { adminMiddleware } = require("./middleware/auth");

dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  "DEFENDER_API_KEY",
  "DEFENDER_API_SECRET",
  "RPC_URL",
  "MONGO_URI",
  "ADMIN_ADDRESS",
];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error("Missing environment variables:", missingEnvVars);
  process.exit(1);
}

const app = express();

// Enable CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "adminAddress",
      "signature",
      "userAddress", // Add userAddress here
    ],
  })
);

// Middleware to parse JSON bodies
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  next();
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Initialize Relayer client
const relaySigner = new Relayer({
  apiKey: process.env.DEFENDER_API_KEY,
  apiSecret: process.env.DEFENDER_API_SECRET,
});

// Initialize ethers provider
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
console.log("Using RPC_URL:", process.env.RPC_URL);

// Import Staking Contract ABI
const StakingContractABI = require("./StakingContractABI.json");
console.log("Relay Signer and Provider Initialized");

// Check suspension status
app.get("/api/check-suspension/:address", async (req, res) => {
  const { address } = req.params;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }
  try {
    const suspension = await Suspension.findOne({
      address: address.toLowerCase(),
    });
    res.json({
      isSuspended: !!suspension,
      reason: suspension ? suspension.reason : null,
      suspendedAt: suspension ? suspension.suspendedAt : null,
    });
  } catch (error) {
    console.error("Check suspension error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Suspend an account (admin only)
app.post("/api/suspend", adminMiddleware, async (req, res) => {
  const { address, reason } = req.body;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }
  try {
    const suspension = new Suspension({
      address: address.toLowerCase(),
      reason: reason || "No reason provided",
      admin: req.adminAddress,
    });
    await suspension.save();
    res.json({ success: true, message: `Account ${address} suspended` });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Account already suspended" });
    }
    console.error("Suspend error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Unsuspend an account (admin only)
app.post("/api/unsuspend", adminMiddleware, async (req, res) => {
  const { address } = req.body;
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }
  try {
    const result = await Suspension.findOneAndDelete({
      address: address.toLowerCase(),
    });
    if (!result) {
      return res.status(404).json({ error: "Account not suspended" });
    }
    res.json({ success: true, message: `Account ${address} unsuspended` });
  } catch (error) {
    console.error("Unsuspend error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all suspended accounts (admin only)
app.get("/api/suspended-accounts", async (req, res) => {
  try {
    const suspensions = await Suspension.find();
    res.json(suspensions);
  } catch (error) {
    console.error("Get suspended accounts error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Updated relayer endpoint with suspension check
app.post("/relay", async (req, res) => {
  try {
    const {
      contractAddress,
      functionName,
      args,
      userAddress,
      signature,
      chainId,
      speed,
    } = req.body;

    if (
      !chainId ||
      !contractAddress ||
      !functionName ||
      !args ||
      !userAddress ||
      !signature
    ) {
      console.error("Missing required fields for meta-transaction:", {
        contractAddress,
        functionName,
        args,
        userAddress,
        signature,
        chainId,
      });
      return res.status(400).json({
        error:
          "Missing required fields: contractAddress, functionName, args, userAddress, signature, chainId",
      });
    }

    // Check suspension status
    const suspension = await Suspension.findOne({
      address: userAddress.toLowerCase(),
    });
    if (suspension) {
      console.log(
        `Blocked meta-transaction for suspended user: ${userAddress}`
      );
      return res.status(403).json({
        error: `Account is suspended: ${suspension.reason}`,
      });
    }

    console.log("Relaying meta-transaction:", {
      contractAddress,
      functionName,
      args,
      userAddress,
      signature,
      chainId,
      speed,
    });

    // Validate chainId
    if (Number(chainId) !== 56) {
      console.error("Invalid chainId:", chainId);
      return res
        .status(400)
        .json({ error: "Invalid chainId, expected 56 (BSC)" });
    }

    // Validate inputs
    if (!ethers.isAddress(contractAddress) || !ethers.isAddress(userAddress)) {
      console.error("Invalid address:", { contractAddress, userAddress });
      return res
        .status(400)
        .json({ error: "Invalid contractAddress or userAddress" });
    }
    if (!signature.match(/^0x[a-fA-F0-9]{130}$/)) {
      console.error("Invalid signature format:", signature);
      return res.status(400).json({ error: "Invalid signature format" });
    }

    // Construct transaction for Defender relayer
    const tx = {
      to: contractAddress,
      data: new ethers.Interface(StakingContractABI).encodeFunctionData(
        functionName,
        args
      ),
      gasLimit: 300000,
      gasPrice: ethers.parseUnits("3", "gwei").toString(),
      chainId: Number(chainId),
      speed: speed || "fast",
      value: "0",
    };

    console.log("Sending meta-transaction via Defender:", tx);

    const response = await relaySigner.sendTransaction(tx);
    console.log("Defender Relayer response:", response);

    // Wait for transaction confirmation
    try {
      const receipt = await provider.waitForTransaction(
        response.hash,
        1,
        120000
      );
      console.log("Transaction Receipt:", {
        hash: response.hash,
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      });

      if (receipt.status !== 1) {
        console.error("Transaction failed:", response.hash);
        return res
          .status(500)
          .json({ error: "Transaction failed on-chain", hash: response.hash });
      }

      return res.json({ hash: response.hash, success: true });
    } catch (confirmationError) {
      console.error("Transaction confirmation error:", {
        hash: response.hash,
        message: confirmationError.message,
        stack: confirmationError.stack,
      });
      return res.status(500).json({
        error: "Failed to confirm transaction",
        hash: response.hash,
        details: confirmationError.message,
      });
    }
  } catch (error) {
    console.error("Relay Error:", {
      message: error.message,
      response: error.response
        ? {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers,
          }
        : null,
      stack: error.stack,
    });

    if (
      error.message.includes("authentication") ||
      error.message.includes("API key and secret are required")
    ) {
      return res.status(401).json({
        error: "Authentication failed: Invalid or missing API credentials",
      });
    }
    if (error.message.includes("Insufficient funds")) {
      return res.status(403).json({
        error: "Relayer has insufficient funds. Please fund the relayer.",
      });
    }
    if (error.message.includes("status code 400")) {
      return res.status(400).json({
        error: "Invalid transaction parameters",
        details: error.response?.data || error.message,
      });
    }
    return res.status(500).json({ error: `Relay error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
