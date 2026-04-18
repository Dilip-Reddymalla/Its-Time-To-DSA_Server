const mongoose = require('mongoose');

const platformConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  isPaused: { type: Boolean, default: false },
  pausedAt: { type: Date, default: null },
  pausedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pauseReason: { type: String, default: null },
  totalPausedDays: { type: Number, default: 0 },  // cumulative across all pauses
  pauseHistory: [{
    pausedAt: Date,
    resumedAt: Date,
    pausedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    durationDays: Number
  }]
}, { timestamps: true });

module.exports = mongoose.model('PlatformConfig', platformConfigSchema);
