const Progress = require('../models/Progress');
const Problem = require('../models/Problem');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { createError } = require('../middleware/errorHandler');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getTodayIST = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
};

const getAllProgress = async (req, res, next) => {
  try {
    const progress = await Progress.find({ userId: req.user._id })
      .sort({ date: -1 })
      .populate('assigned', 'name difficulty topic')
      .lean();
    res.json({ success: true, data: progress });
  } catch (err) {
    next(err);
  }
};

const getTodayProgress = async (req, res, next) => {
  try {
    const today = getTodayIST();
    let progress = await Progress.findOne({ userId: req.user._id, date: today })
      .populate('assigned', 'name difficulty topic slug leetcodeSlug dryRunResources')
      .populate('completed.problemId', 'name')
      .lean();

    if (!progress) {
      const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
      const dayEntry = schedule?.days.find((d) => {
        const d2 = new Date(d.date);
        d2.setHours(0, 0, 0, 0);
        return d2.getTime() === today.getTime();
      });

      if (dayEntry) {
        const newProgress = await Progress.create({
          userId: req.user._id,
          date: today,
          dayNumber: dayEntry.dayNumber,
          assigned: dayEntry.problemIds,
        });
        progress = newProgress;
      }
    }

    res.json({ success: true, data: progress });
  } catch (err) {
    next(err);
  }
};

const markProblem = async (req, res, next) => {
  try {
    const { problemId, solved } = req.body;
    const today = getTodayIST();

    const progress = await Progress.findOne({ userId: req.user._id, date: today });
    if (!progress) return next(createError('No progress entry for today.', 404, 'NO_PROGRESS'));

    if (solved) {
      const already = progress.completed.find((c) => c.problemId.toString() === problemId);
      if (!already) {
        progress.completed.push({ problemId, solvedAt: new Date(), verifiedViaLC: false });
        await User.findByIdAndUpdate(req.user._id, { $inc: { totalSolved: 1 } });
      }
    } else {
      progress.completed = progress.completed.filter((c) => c.problemId.toString() !== problemId);
    }

    progress.allDone = progress.completed.length >= progress.assigned.length;
    await progress.save();

    res.json({ success: true, data: progress });
  } catch (err) {
    next(err);
  }
};

const addNote = async (req, res, next) => {
  try {
    const { problemId, text } = req.body;
    const today = getTodayIST();

    const progress = await Progress.findOne({ userId: req.user._id, date: today });
    if (!progress) return next(createError('No progress entry for today.', 404));

    const existing = progress.notes.find((n) => n.problemId.toString() === problemId);
    if (existing) {
      existing.text = text;
      existing.updatedAt = new Date();
    } else {
      progress.notes.push({ problemId, text });
    }

    await progress.save();
    res.json({ success: true, message: 'Note saved.' });
  } catch (err) {
    next(err);
  }
};

const toggleBookmark = async (req, res, next) => {
  try {
    const { problemId } = req.body;
    const today = getTodayIST();

    const progress = await Progress.findOne({ userId: req.user._id, date: today });
    if (!progress) return next(createError('No progress entry for today.', 404));

    const idx = progress.bookmarked.findIndex((id) => id.toString() === problemId);
    if (idx > -1) {
      progress.bookmarked.splice(idx, 1);
    } else {
      progress.bookmarked.push(problemId);
    }

    await progress.save();
    res.json({ success: true, bookmarked: idx === -1 });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllProgress, getTodayProgress, markProblem, addNote, toggleBookmark };
