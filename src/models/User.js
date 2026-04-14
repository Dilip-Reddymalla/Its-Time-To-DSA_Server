const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    avatar: { type: String, default: null },

    // Onboarding fields
    leetcodeUsername: { type: String, trim: true, default: null, index: true },
    startDate: { type: Date, default: null },
    dailyGoal: {
      type: String,
      enum: ['light', 'medium', 'intense'],
      default: 'medium',
    },
    totalDays: { type: Number, default: 90 },
    usernameChangeCount: { type: Number, default: 0 },
    onboardingComplete: { type: Boolean, default: false },

    // Streak & Stats
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    restTokens: { type: Number, default: 1, max: 3 },
    totalSolved: { type: Number, default: 0 },
    lastStreakUpdate: { type: Date, default: null },

    lastActiveAt: { type: Date, default: Date.now },

    // Admin & Moderation
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
