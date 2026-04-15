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

    // --- CARRY-OVER Logic: find previously assigned problems that haven't been completed ---
    const allProgressDocs = await Progress.find({ 
      userId: req.user._id,
      date: { $lt: targetDate } 
    }).select('completed').lean();
    
    const globalCompletedBeforeToday = new Set();
    allProgressDocs.forEach((p) => {
      (p.completed || []).forEach(c => globalCompletedBeforeToday.add(c.problemId.toString()));
    });

    const alreadyIncludedIds = new Set(problemIds.map(id => id.toString()));
    const carryoverProblemIds = [];

    for (const pastDay of schedule.days || []) {
      const pastDayStr = toISTDateString(new Date(pastDay.date));
      if (pastDayStr >= todayStr) continue;

      const pastAssignedIds = pastDay.problems
        ? pastDay.problems.map(p => p.problemId.toString())
        : (pastDay.problemIds || []).map(id => id.toString());

      for (const pid of pastAssignedIds) {
        if (!globalCompletedBeforeToday.has(pid) && !alreadyIncludedIds.has(pid)) {
          carryoverProblemIds.push(pid);
          alreadyIncludedIds.add(pid);
        }
      }
    }

    const allProblemIdsToVerify = [...problemIds, ...carryoverProblemIds];
    const problems = await Problem.find({ _id: { $in: allProblemIdsToVerify } }).lean();
    const submissions = await verifyLeetCodeSubmissions(req.user.leetcodeUsername);
    const acceptedSlugs = new Set(submissions.map((s) => s.titleSlug));

    let newlySolvedCount = 0;
    const updated = [];
    for (const problem of problems) {
      if (!problem.leetcodeSlug) continue;
      const solved = acceptedSlugs.has(problem.leetcodeSlug);
      
      if (solved) {
        const existingCompletion = progress.completed.find(
          (c) => c.problemId.toString() === problem._id.toString()
        );

        if (!existingCompletion) {
          // Brand new solve found via verification
          progress.completed.push({ problemId: problem._id, solvedAt: new Date(), verifiedViaLC: true });
          newlySolvedCount++;
        } else if (!existingCompletion.verifiedViaLC) {
          // Was manually marked before, now verified via LC
          existingCompletion.verifiedViaLC = true;
          // We don't increment newlySolvedCount here because totalSolved was already 
          // incremented when the problem was manually marked.
        }
      }
      updated.push({ slug: problem.leetcodeSlug, solved });
    }

    const totalAssigned = dayEntry.problems ? dayEntry.problems.length : (dayEntry.problemIds?.length || progress.assigned?.length || 0);
    progress.allDone = progress.completed.length >= totalAssigned;
    progress.verifiedAt = new Date();
    await progress.save();

    const streakData = await updateStreak(req.user._id);
    if (newlySolvedCount > 0) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { totalSolved: newlySolvedCount } });
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
