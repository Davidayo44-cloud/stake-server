const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    lowercase: true,
    validate: {
      validator: function (v) {
        return /^0x[a-fA-F0-9]{40}$/.test(v); // Validate Ethereum/BSC address
      },
      message: "Invalid wallet address",
    },
  },
  usdtAmount: {
    type: Number,
    required: true,
    min: [0, "USDT amount must be positive"],
  },
  bankDetails: {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
  },
  txHash: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^0x[a-fA-F0-9]{64}$/.test(v); // Validate transaction hash
      },
      message: "Invalid transaction hash",
    },
  },
  status: {
    type: String,
    enum: ["pending", "awaiting verification", "verified", "failed"],
    default: "pending",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

WithdrawalSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Withdrawal", WithdrawalSchema);
