const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: { type: Date, required: true },
    dayNumber: { type: Number, required: true },

    assigned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problem' }],

    completed: [
      {
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
        solvedAt: { type: Date, default: Date.now },
        verifiedViaLC: { type: Boolean, default: false },
      },
    ],

    notes: [
      {
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
        text: { type: String, default: '' },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    bookmarked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Problem' }],

    verifiedAt: { type: Date, default: null },
    allDone: { type: Boolean, default: false },
    isRestDay: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound unique index: one progress doc per user per day
progressSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
