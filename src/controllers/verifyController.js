const Problem = require('../models/Problem');
const Progress = require('../models/Progress');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { verifyLeetCodeSubmissions } = require('../services/leetcodeService');
const { updateStreak } = require('../services/streakService');
const { createError } = require('../middleware/errorHandler');
const { getEffectiveTodayIST, toISTDateString } = require('../utils/dateUtils');


const verifySubmissions = async (req, res, next) => {
  try {
    if (!req.user.leetcodeUsername) {
      return next(createError('No LeetCode username set. Complete onboarding first.', 400, 'NO_LC_USERNAME'));
    }

    const targetDate = getEffectiveTodayIST();
    const todayStr = toISTDateString(targetDate);

    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    const dayEntry = schedule?.days.find((d) => {
      return toISTDateString(new Date(d.date)) === todayStr;
    });

    if (!dayEntry) {
      return next(createError('No active mission scheduled for today.', 404, 'NO_SCHEDULE_TODAY'));
    }

    let progress = await Progress.findOne({ userId: req.user._id, date: targetDate });

    if (!progress) {
      const assignedIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
      const problemsFound = await Problem.find({ _id: { $in: assignedIds } }).lean();
      
      const validAssignedIds = problemsFound
        .filter(p => (p.leetcodeSlug && p.leetcodeSlug !== 'null') || (p.gfgUrl && p.gfgUrl !== 'null'))
        .map(p => p._id);

      progress = await Progress.create({
        userId: req.user._id,
        date: targetDate,
        dayNumber: dayEntry.dayNumber,
        assigned: validAssignedIds,
        completed: []
      });
    }


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
