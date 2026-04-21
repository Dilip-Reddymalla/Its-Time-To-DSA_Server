const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      required: true,
    },
    topic: { type: String, required: true, trim: true },
    subtopic: { type: String, trim: true, default: null },
    leetcodeSlug: { type: String, trim: true, default: null },
    gfgUrl: { type: String, trim: true, default: null },
    gfgLink: { type: String, trim: true, default: null },
    resourceUrl: { type: String, default: null },
    youtubeUrl: { type: String, trim: true, default: null },
    striverTopic: { type: String, default: null },
    source: {
      type: String,
      enum: ['striver-a2z', 'neetcode', 'custom', 'google-sheet'],
      default: 'custom',
    },
    tags: [{ type: String, trim: true }],
    companies: [{ type: String, trim: true }],
    dryRunResources: [
      {
        label: String,
        url: String,
        type: { type: String, enum: ['article', 'video', 'visualization'] },
      },
    ],
    isPremium: { type: Boolean, default: false },
    isOptional: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient topic/difficulty queries
problemSchema.index({ topic: 1, difficulty: 1 });

module.exports = mongoose.model('Problem', problemSchema);
