const Schedule = require('../models/Schedule');
const Progress = require('../models/Progress');
const Problem = require('../models/Problem');
const { createError } = require('../middleware/errorHandler');
const { getEffectiveTodayIST, toISTDateString } = require('../utils/dateUtils');


const getToday = async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    if (!schedule) return next(createError('Schedule not generated yet.', 404, 'NO_SCHEDULE'));

    const todayStr = toISTDateString(getEffectiveTodayIST());
    const dayEntry = schedule.days.find((d) => {
      const dStr = toISTDateString(new Date(d.date));
      return dStr === todayStr;
    });
    if (!dayEntry) return next(createError('No schedule entry for today.', 404, 'NO_DAY_ENTRY'));

    const problemIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
    const problems = await Problem.find({ _id: { $in: problemIds } }).lean();

    // Look up progress for this specific IST day
    const dayStart = getEffectiveTodayIST();
    const progress = await Progress.findOne({ userId: req.user._id, date: dayStart }).lean();

    const completedIds = new Set((progress?.completed || []).map((c) => c.problemId.toString()));
    const bookmarkedIds = new Set((progress?.bookmarked || []).map((id) => id.toString()));
    const notesMap = {};
    (progress?.notes || []).forEach((n) => { notesMap[n.problemId.toString()] = n.text; });

    const enrichedProblems = problems.map((p) => {
      const schedProb = dayEntry.problems?.find(sp => sp.problemId.toString() === p._id.toString());
      return {
        ...p,
        isRevision: schedProb?.isRevision || false,
        isCarryover: false,
        status: schedProb?.status || 'pending',
        solved: completedIds.has(p._id.toString()),
        bookmarked: bookmarkedIds.has(p._id.toString()),
        note: notesMap[p._id.toString()] || '',
      };
    });

    // === CARRY-OVER: Append unsolved problems from past days ===
    const alreadyIncludedIds = new Set(problemIds.map(id => id.toString()));
    const carryoverProblemIds = [];

    const allProgressDocs = await Progress.find({ userId: req.user._id }).lean();
    
    // We only care if the user completed the problem BEFORE today.
    // If they completed it today, we STILL want it to carry-over to today's list so they can see it checked off!
    const globalCompletedBeforeToday = new Set();
    allProgressDocs.forEach((p) => {
      const pDateStr = toISTDateString(new Date(p.date));
      if (pDateStr < todayStr) {
        (p.completed || []).forEach(c => globalCompletedBeforeToday.add(c.problemId.toString()));
      }
    });

    for (const pastDay of schedule.days) {
      const pastDayStr = toISTDateString(new Date(pastDay.date));

      // Skip today and future days
      if (pastDayStr >= todayStr) continue;

      const pastAssignedIds = pastDay.problems
        ? pastDay.problems.map(p => p.problemId.toString())
        : (pastDay.problemIds || []).map(id => id.toString());

      for (const pid of pastAssignedIds) {
        // Carry over if:
        // 1. Not solved in any past day (checked via allProgressDocs)
        // 2. Not already assigned for today naturally
        // 3. Not solved TODAY yet (checked via completedIds)
        if (!globalCompletedBeforeToday.has(pid) && !alreadyIncludedIds.has(pid) && !completedIds.has(pid)) {
          carryoverProblemIds.push(pid);
          alreadyIncludedIds.add(pid);
        }
      }
    }

    if (carryoverProblemIds.length > 0) {
      const carryoverProblems = await Problem.find({ _id: { $in: carryoverProblemIds } }).lean();
      carryoverProblems.forEach((p) => {
        enrichedProblems.push({
          ...p,
          isRevision: false,
          isCarryover: true,
          status: 'pending',
          solved: completedIds.has(p._id.toString()),
          bookmarked: bookmarkedIds.has(p._id.toString()),
          note: notesMap[p._id.toString()] || '',
        });
      });
    }
    // === END CARRY-OVER ===

    // Separate valid problems vs those without links (Research/practice only)
    const isValidProblem = (p) => {
      const validLc = p.leetcodeSlug && p.leetcodeSlug !== 'null';
      const validGfg = (p.gfgUrl && p.gfgUrl !== 'null') || (p.gfgLink && p.gfgLink !== 'null');
      return !!(validLc || validGfg);
    };
    const coreProblems = enrichedProblems.filter(isValidProblem).map(p => ({
      ...p,
      isOptional: !!(p.leetcodeSlug && p.isPremium)
    }));
    const searchPractice = enrichedProblems.filter(p => !isValidProblem(p));

    const mandatoryProblems = coreProblems.filter(p => !p.isOptional);
    const requiredTotal = mandatoryProblems.length;
    const requiredCompleted = mandatoryProblems.filter(p => p.solved).length;

    res.json({
      success: true,
      data: {
        dayNumber: dayEntry.dayNumber,
        date: dayEntry.date,
        type: dayEntry.type,
        problems: coreProblems,
        searchPractice: searchPractice,
        carryoverCount: carryoverProblemIds.length,
        concepts: dayEntry.readings ? dayEntry.readings.map(r => r.title) : (dayEntry.concepts || []),
        readings: dayEntry.readings || [],
        isCompleted: dayEntry.isCompleted || false,
        progress: {
          total: requiredTotal,
          completed: requiredCompleted,
          allDone: requiredCompleted >= requiredTotal && requiredTotal > 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const getDayByNumber = async (req, res, next) => {
  try {
    const dayNum = parseInt(req.params.n);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 90) {
      return next(createError('Day number must be between 1 and 90', 400, 'INVALID_DAY'));
    }
    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    if (!schedule) return next(createError('Schedule not found', 404, 'NO_SCHEDULE'));

    const dayEntry = schedule.days.find((d) => d.dayNumber === dayNum);
    if (!dayEntry) return next(createError(`Day ${dayNum} not found`, 404, 'NO_DAY_ENTRY'));

    const problemIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
    const problems = await Problem.find({ _id: { $in: problemIds } }).lean();
    res.json({ success: true, data: { ...dayEntry, problems } });
  } catch (err) {
    next(err);
  }
};

const getOverview = async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    if (!schedule) return next(createError('Schedule not found', 404, 'NO_SCHEDULE'));

    const progressDocs = await Progress.find({ userId: req.user._id })
      .select('date allDone completed')
      .lean();

    const progressMap = {};
    progressDocs.forEach((p) => {
      const key = new Date(p.date).toISOString().split('T')[0];
      progressMap[key] = { allDone: p.allDone, completedCount: p.completed.length };
    });

    const overview = schedule.days.map((d) => {
      const key = new Date(d.date).toISOString().split('T')[0];
      const prog = progressMap[key] || {};
      return {
        dayNumber: d.dayNumber,
        date: d.date,
        type: d.type,
        problemCount: d.problems ? d.problems.length : (d.problemIds?.length || 0),
        estimatedTime: d.estimatedTime || 'Self-Paced',
        allDone: prog.allDone || false,
        completedCount: prog.completedCount || 0,
        concepts: d.readings ? d.readings.map(r => r.title) : (d.concepts || []),
      };
    });

    res.json({ success: true, data: overview });
  } catch (err) {
    next(err);
  }
};

const getFullSchedule = async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ userId: req.user._id })
      .populate('days.problems.problemId', 'name difficulty topic leetcodeSlug slug gfgUrl youtubeUrl resourceUrl source')
      .lean();

    if (!schedule) {
      return next(createError('Schedule not found', 404, 'NO_SCHEDULE'));
    }

    // Merge progress data so the calendar can colour days without a second API call
    const progressDocs = await Progress.find({ userId: req.user._id })
      .select('date allDone completed')
      .lean();

    const progressMap = {};
    progressDocs.forEach((p) => {
      const key = new Date(p.date).toISOString().split('T')[0];
      progressMap[key] = { allDone: p.allDone, completedCount: p.completed.length };
    });

    const enrichedDays = schedule.days.map((d) => {
      const key = new Date(d.date).toISOString().split('T')[0];
      const prog = progressMap[key] || {};
      return {
        ...d,
        allDone: prog.allDone || false,
        completedCount: prog.completedCount || 0,
        problemCount: d.problems ? d.problems.length : (d.problemIds?.length || 0),
      };
    });

    // Mark days that follow a day with incomplete tasks
    for (let i = 1; i < enrichedDays.length; i++) {
      const prev = enrichedDays[i - 1];
      const prevIsPast = new Date(prev.date) < new Date(new Date().toDateString());
      enrichedDays[i].hasPrevIncomplete = prevIsPast && !prev.allDone && prev.problemCount > 0;
    }

    res.json({ success: true, data: enrichedDays });
  } catch (err) {
    next(err);
  }
};

module.exports = { getToday, getDayByNumber, getOverview, getFullSchedule };
