const mongoose = require('mongoose');

const daySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: ['learn', 'revision', 'mixed'], default: 'learn' },
    isCompleted: { type: Boolean, default: false },
    readings: [
      {
        title: String,
        type: { type: String }
      }
    ],
    problems: [
      {
        problemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem' },
        difficulty: String,
        topic: String,
        isRevision: Boolean,
        status: { type: String, default: 'pending' }
      }
    ]
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    generatedAt: { type: Date, default: Date.now },
    totalDays: { type: Number, default: 90 },
    dailyGoal: { type: String },
    days: [daySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Schedule', scheduleSchema);
