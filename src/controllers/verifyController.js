const Problem = require('../models/Problem');
const Progress = require('../models/Progress');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { verifyLeetCodeSubmissions } = require('../services/leetcodeService');
const { updateStreak } = require('../services/streakService');
const { createError } = require('../middleware/errorHandler');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getTargetDate = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  const todayIST = new Date(ist.getTime() - IST_OFFSET_MS);

  // Grace period: if it's before 2AM IST, count for yesterday
  const nowIST = new Date(now.getTime() + IST_OFFSET_MS);
  if (nowIST.getUTCHours() < 2) {
    const yesterday = new Date(todayIST);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return todayIST;
};

const verifySubmissions = async (req, res, next) => {
  try {
    if (!req.user.leetcodeUsername) {
      return next(createError('No LeetCode username set. Complete onboarding first.', 400, 'NO_LC_USERNAME'));
    }

    const targetDate = getTargetDate();

    let progress = await Progress.findOne({ userId: req.user._id, date: targetDate });
    if (!progress) return next(createError('No schedule entry for today.', 404, 'NO_PROGRESS'));

    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    const dayEntry = schedule?.days.find((d) => {
      const d2 = new Date(d.date);
      d2.setHours(0, 0, 0, 0);
      return d2.getTime() === targetDate.getTime();
    });
    if (!dayEntry) return next(createError('Schedule day not found.', 404));

    // Use the new nested problems structure from the updated Schedule schema
    const problemIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
    const problems = await Problem.find({ _id: { $in: problemIds } }).lean();
    const submissions = await verifyLeetCodeSubmissions(req.user.leetcodeUsername);
    const acceptedSlugs = new Set(submissions.map((s) => s.titleSlug));

    const updated = [];
    for (const problem of problems) {
      if (!problem.leetcodeSlug) continue;
      const solved = acceptedSlugs.has(problem.leetcodeSlug);
      if (solved) {
        const alreadyVerified = progress.completed.find(
          (c) => c.problemId.toString() === problem._id.toString() && c.verifiedViaLC
        );
        if (!alreadyVerified) {
          const existing = progress.completed.find((c) => c.problemId.toString() === problem._id.toString());
          if (existing) {
            existing.verifiedViaLC = true;
          } else {
            progress.completed.push({ problemId: problem._id, solvedAt: new Date(), verifiedViaLC: true });
          }
        }
      }
      updated.push({ slug: problem.leetcodeSlug, solved });
    }

    const totalAssigned = dayEntry.problems ? dayEntry.problems.length : (dayEntry.problemIds?.length || progress.assigned?.length || 0);
    progress.allDone = progress.completed.length >= totalAssigned;
    progress.verifiedAt = new Date();
    await progress.save();

    const streakData = await updateStreak(req.user._id);
    const newlySolved = updated.filter((u) => u.solved).length;
    if (newlySolved > 0) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { totalSolved: newlySolved } });
    }

    res.json({
      success: true,
      data: { updated, streakCount: streakData.currentStreak, allDone: progress.allDone },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { verifySubmissions };
