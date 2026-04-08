const mongoose = require('mongoose');

const conceptSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    summary: { type: String, default: '' },
    resources: [
      {
        label: String,
        url: String,
        type: { type: String, enum: ['article', 'video', 'visualization', 'practice'] },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Concept', conceptSchema);
