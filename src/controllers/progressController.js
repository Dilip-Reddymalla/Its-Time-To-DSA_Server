const Progress = require('../models/Progress');
const Problem = require('../models/Problem');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { createError } = require('../middleware/errorHandler');

// Must match scheduleController's date logic exactly: YYYY-MM-DDT00:00:00Z
const getTodayIST = () => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(new Date());
  return new Date(todayStr + 'T00:00:00Z');
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

    // Find or auto-create today's progress doc (upsert)
    let progress = await Progress.findOne({ userId: req.user._id, date: today });
    if (!progress) {
      // Pull the assigned problem IDs from today's schedule to build the doc
      const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
      const dayEntry = schedule?.days.find((d) => {
        return new Date(d.date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }) === todayStr;
      });
      const assignedIds = dayEntry?.problems?.map(p => p.problemId) || dayEntry?.problemIds || [];
      progress = await Progress.create({
        userId: req.user._id,
        date: today,
        dayNumber: dayEntry?.dayNumber,
        assigned: assignedIds,
      });
    }

    if (solved) {
      const already = progress.completed.find((c) => c.problemId.toString() === problemId);
      if (!already) {
        progress.completed.push({ problemId, solvedAt: new Date(), verifiedViaLC: false });
        await User.findByIdAndUpdate(req.user._id, { $inc: { totalSolved: 1 } });
      }
    } else {
      const alreadyIndex = progress.completed.findIndex((c) => c.problemId.toString() === problemId);
      if (alreadyIndex !== -1) {
        progress.completed.splice(alreadyIndex, 1);
        await User.findByIdAndUpdate(req.user._id, { $inc: { totalSolved: -1 } });
      }
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
