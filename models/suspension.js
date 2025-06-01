// server/models/Suspension.js
const mongoose = require("mongoose");

const SuspensionSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
    lowercase: true, // Store addresses in lowercase for consistency
  },
  reason: {
    type: String,
    default: "No reason provided", // Optional reason
  },
  suspendedAt: {
    type: Date,
    default: Date.now,
  },
  admin: {
    type: String, // Admin address who performed the suspension
    required: true,
  },
});

module.exports = mongoose.model("Suspension", SuspensionSchema);
