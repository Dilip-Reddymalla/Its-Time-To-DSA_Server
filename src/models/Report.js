const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    reason: {
      type: String,
      required: true,
      enum: ['broken-link', 'wrong-difficulty', 'wrong-topic', 'missing-details', 'other'],
    },
    description: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'resolved'],
      default: 'pending',
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    adminApprovedReplacement: { type: Boolean, default: false },
    replacementApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    replacementApprovedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
