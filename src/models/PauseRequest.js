const mongoose = require('mongoose');

const pauseRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } // The admin
}, { timestamps: true });

module.exports = mongoose.model('PauseRequest', pauseRequestSchema);
