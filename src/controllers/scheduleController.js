const Schedule = require('../models/Schedule');
const Progress = require('../models/Progress');
const Problem = require('../models/Problem');
const Report = require('../models/Report');
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

    const approvedReports = await Report.find({
      userId: req.user._id,
      adminApprovedReplacement: true,
    })
      .select('problemId')
      .lean();
    const approvedReplacementSet = new Set(approvedReports.map((r) => r.problemId.toString()));

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
        canReplace: approvedReplacementSet.has(p._id.toString()),
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

    let carryoverCount = 0;
    if (carryoverProblemIds.length > 0) {
      const carryoverProblems = await Problem.find({ _id: { $in: carryoverProblemIds } }).lean();
      carryoverProblems.forEach((p) => {
        const isOpt = p.isOptional || !!(p.leetcodeSlug && p.isPremium);
        const validLc = p.leetcodeSlug && p.leetcodeSlug !== 'null';
        const validGfg = (p.gfgUrl && p.gfgUrl !== 'null') || (p.gfgLink && p.gfgLink !== 'null');
        const isValid = !!(validLc || validGfg);
        
        if (isOpt || !isValid) return;

        carryoverCount++;
        enrichedProblems.push({
          ...p,
          isRevision: false,
          isCarryover: true,
          status: 'pending',
          solved: completedIds.has(p._id.toString()),
          bookmarked: bookmarkedIds.has(p._id.toString()),
          note: notesMap[p._id.toString()] || '',
          canReplace: approvedReplacementSet.has(p._id.toString()),
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
      isOptional: p.isOptional || !!(p.leetcodeSlug && p.isPremium)
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
        carryoverCount: carryoverCount,
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

    const progressDocs = await Progress.find({ userId: req.user._id }).lean();

    const globalCompletedSet = new Set();
    const progressMap = {};
    
    progressDocs.forEach((p) => {
      const key = new Date(p.date).toISOString().split('T')[0];
      progressMap[key] = p;
      (p.completed || []).forEach(c => globalCompletedSet.add(c.problemId.toString()));
    });

    const overview = schedule.days.map((d) => {
      const key = new Date(d.date).toISOString().split('T')[0];
      const prog = progressMap[key];

      let completedCount = 0;
      let problemCount = 0;
      let allDone = false;

      if (prog && prog.assigned) {
        problemCount = prog.assigned.length;
        prog.assigned.forEach(id => {
          if (globalCompletedSet.has(id.toString())) completedCount++;
        });
        allDone = problemCount > 0 && completedCount >= problemCount;
      } else {
        problemCount = d.problems ? d.problems.length : (d.problemIds?.length || 0);
      }

      return {
        dayNumber: d.dayNumber,
        date: d.date,
        type: d.type,
        problemCount,
        estimatedTime: d.estimatedTime || 'Self-Paced',
        allDone,
        completedCount,
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

    // Merge progress data and compute global completions
    const progressDocs = await Progress.find({ userId: req.user._id }).lean();

    const globalCompletedSet = new Set();
    const progressMap = {};

    progressDocs.forEach((p) => {
      const key = new Date(p.date).toISOString().split('T')[0];
      progressMap[key] = p;
      (p.completed || []).forEach(c => globalCompletedSet.add(c.problemId.toString()));
    });

    const enrichedDays = schedule.days.map((d) => {
      const key = new Date(d.date).toISOString().split('T')[0];
      const prog = progressMap[key];

      let completedCount = 0;
      let problemCount = 0;
      let allDone = false;

      if (prog && prog.assigned) {
        problemCount = prog.assigned.length;
        prog.assigned.forEach(id => {
          if (globalCompletedSet.has(id.toString())) completedCount++;
        });
        allDone = problemCount > 0 && completedCount >= problemCount;
      } else {
        problemCount = d.problems ? d.problems.length : (d.problemIds?.length || 0);
        // If not populated by progress.assigned, accurately count core problems manually since we populated
        if (d.problems) {
            let coreProblemCount = 0;
            d.problems.forEach(sp => {
              const isOpt = sp.problemId?.isOptional || !!(sp.problemId?.leetcodeSlug && sp.problemId?.isPremium);
              const validLc = sp.problemId?.leetcodeSlug && sp.problemId?.leetcodeSlug !== 'null';
              const validGfg = (sp.problemId?.gfgUrl && sp.problemId?.gfgUrl !== 'null') || (sp.problemId?.gfgLink && sp.problemId?.gfgLink !== 'null');
              if (!isOpt && (validLc || validGfg)) coreProblemCount++;
            });
            problemCount = coreProblemCount;
        }
      }

      return {
        ...d,
        allDone,
        completedCount,
        problemCount,
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

const replaceProblem = async (req, res, next) => {
  try {
    const { problemId } = req.body;
    const schedule = await Schedule.findOne({ userId: req.user._id });
    if (!schedule) return next(createError('Schedule not found', 404));

    let dayOccurrences = [];

    for (const day of schedule.days) {
      if (day.problems) {
        const idx = day.problems.findIndex(p => p.problemId.toString() === problemId);
        if (idx !== -1) dayOccurrences.push({ day, index: idx });
      } else if (day.problemIds) {
        const pIdx = day.problemIds.findIndex(id => id.toString() === problemId);
        if (pIdx !== -1) dayOccurrences.push({ day, index: pIdx });
      }
    }

    if (dayOccurrences.length === 0) return next(createError('Problem not assigned in schedule', 400));

    const allAssignedIds = new Set();
    schedule.days.forEach(day => {
      if (day.problems) day.problems.forEach(p => allAssignedIds.add(p.problemId.toString()));
      if (day.problemIds) day.problemIds.forEach(id => allAssignedIds.add(id.toString()));
    });

    const oldProblem = await Problem.findById(problemId);
    if (!oldProblem) return next(createError('Problem not found', 404));

    const getCandidates = async (query, diffs, allowedTopics) => {
      let cands = await Problem.find({ ...query, difficulty: { $in: diffs } }).lean();
      if (allowedTopics) {
        cands = cands.filter(p => allowedTopics.includes(p.topic));
      }
      return cands.filter(p => {
         const validLc = (p.leetcodeSlug && p.leetcodeSlug !== 'null');
         const validGfg = ((p.gfgUrl && p.gfgUrl !== 'null') || (p.gfgLink && p.gfgLink !== 'null'));
         const isLcPremiumOpt = !!(p.leetcodeSlug && p.isPremium);
         return (validLc || validGfg) && !isLcPremiumOpt;
      });
    };

    let allowedDiffs = ['Easy', 'Medium'];
    if (oldProblem.difficulty === 'Hard') allowedDiffs = ['Hard', 'Medium'];

    let baseQuery = { _id: { $nin: [...allAssignedIds] }, isOptional: { $ne: true } };
    let candidates = await getCandidates(baseQuery, allowedDiffs, [oldProblem.topic]);

    if (candidates.length === 0) {
      candidates = await getCandidates(baseQuery, allowedDiffs, null);
    }

    if (candidates.length === 0) {
      // Fallback: The entire DB is already in the schedule!
      const todayAssignedIds = new Set();
      dayOccurrences.forEach(occ => {
        if (occ.day.problems) occ.day.problems.forEach(p => todayAssignedIds.add(p.problemId.toString()));
        if (occ.day.problemIds) occ.day.problemIds.forEach(id => todayAssignedIds.add(id.toString()));
      });
      
      const fallbackQuery = { _id: { $nin: [...todayAssignedIds] }, isOptional: { $ne: true } };
      candidates = await getCandidates(fallbackQuery, allowedDiffs, [oldProblem.topic]);

      if (candidates.length === 0) {
        candidates = await getCandidates(fallbackQuery, allowedDiffs, null);
      }
    }

    if (candidates.length === 0) {
      return next(createError('No replacement problems available in the database.', 404));
    }

    const replacement = candidates[Math.floor(Math.random() * candidates.length)];

    for (const occ of dayOccurrences) {
      if (occ.day.problems) {
        occ.day.problems[occ.index].problemId = replacement._id;
      } else if (occ.day.problemIds) {
        occ.day.problemIds[occ.index] = replacement._id;
      }
    }

    schedule.markModified('days');
    await schedule.save();
    
    // Attempt to update progress if assigned across occurrences
    const progressDates = dayOccurrences.map(occ => new Date(occ.day.date));
    const progresses = await Progress.find({ userId: req.user._id, date: { $in: progressDates } });
    
    let isUserTotalSolvedDecremented = false;

    for (const progress of progresses) {
      let isChanged = false;
      const pIndex = progress.assigned.findIndex(id => id.toString() === problemId);
      if (pIndex !== -1) {
         progress.assigned[pIndex] = replacement._id;
         isChanged = true;
      }
      
      const cIndex = progress.completed.findIndex(c => c.problemId.toString() === problemId);
      if (cIndex !== -1) {
          progress.completed = progress.completed.filter(c => c.problemId.toString() !== problemId);
          // Decrement global count (only once per user, even if solved multiple times)
          if (!isUserTotalSolvedDecremented) {
            const user = await User.findById(req.user._id);
            if (user) {
              user.totalSolved = Math.max(0, (user.totalSolved || 0) - 1);
              await user.save();
              isUserTotalSolvedDecremented = true;
            }
          }
          isChanged = true;
      }

      const bIndex = progress.bookmarked.findIndex(id => id.toString() === problemId);
      if (bIndex !== -1) {
         progress.bookmarked = progress.bookmarked.filter(id => id.toString() !== problemId);
         isChanged = true;
      }

      if (isChanged) {
        progress.allDone = progress.completed.length >= progress.assigned.length;
        await progress.save();
      }
    }

    res.json({ success: true, message: 'Problem replaced successfully.', data: replacement });
  } catch(err) { next(err); }
}

module.exports = { getToday, getDayByNumber, getOverview, getFullSchedule, replaceProblem };
