const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  userId: { type: String, required: true, lowercase: true }, // Wallet address
  name: { type: String, required: true },
  address: { type: String, required: true },
  usdtAmount: { type: Number, required: true },
  nairaAmount: { type: Number, required: true },
  status: {
    type: String,
    default: "pending",
    enum: ["pending", "awaiting verification", "verified", "failed"],
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", TransactionSchema);
