
const { ethers } = require("ethers");

const adminMiddleware = async (req, res, next) => {
  const adminAddress = req.headers.adminaddress; // Use lowercase to match frontend
  const { signature } = req.headers;

  console.log("adminMiddleware: Received headers", {
    adminAddress,
    signature,
  });

  if (!adminAddress || !ethers.isAddress(adminAddress)) {
    console.log("adminMiddleware: Invalid admin address", { adminAddress });
    return res.status(400).json({ error: "Invalid admin address" });
  }

  if (!signature || !signature.match(/^0x[a-fA-F0-9]{130}$/)) {
    console.log("adminMiddleware: Invalid or missing signature", { signature });
    return res.status(400).json({ error: "Invalid or missing signature" });
  }

  try {
    // Verify signature
    const message = "Admin access";
    const signer = ethers.verifyMessage(message, signature).toLowerCase();
    console.log("adminMiddleware: Signature verification", {
      signer,
      adminAddress: adminAddress.toLowerCase(),
    });
    if (signer !== adminAddress.toLowerCase()) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    // Check if adminAddress is the contract admin
    const admin = process.env.ADMIN_ADDRESS.toLowerCase(); // From .env
    console.log("adminMiddleware: Admin check", {
      received: adminAddress.toLowerCase(),
      expected: admin,
    });
    if (adminAddress.toLowerCase() !== admin) {
      return res.status(403).json({ error: "Not authorized as admin" });
    }

    req.adminAddress = adminAddress.toLowerCase();
    next();
  } catch (error) {
    console.error("adminMiddleware: Auth error:", {
      message: error.message,
      stack: error.stack,
      adminAddress,
    });
    res.status(403).json({ error: "Authentication failed" });
  }
};

module.exports = { adminMiddleware };
