const User = require('../models/User');
const Progress = require('../models/Progress');
const Schedule = require('../models/Schedule');
const Problem = require('../models/Problem');
const Report = require('../models/Report');
const { createError } = require('../middleware/errorHandler');
const { getEffectiveTodayIST, toISTDateString } = require('../utils/dateUtils');
const { updateStreak } = require('../services/streakService');

/**
 * Shared helper: determine if a problem is a "core" trackable problem
 * (same logic used in scheduleController.getToday)
 */
const isValidProblem = (p) => {
  const validLc = p.leetcodeSlug && p.leetcodeSlug !== 'null';
  const validGfg = (p.gfgUrl && p.gfgUrl !== 'null') || (p.gfgLink && p.gfgLink !== 'null');
  return !!(validLc || validGfg);
};

/**
 * Shared helper: for a given schedule day entry, compute the accurate
 * assigned/completed counts using the same filtering as the main app.
 * Returns { coreAssigned, coreCompleted, allDone, problems }
 */
const computeDayCounts = async (dayEntry, progressDoc) => {
  if (!dayEntry) return { coreAssigned: 0, coreCompleted: 0, allDone: false, problems: [] };

  const problemIds = dayEntry.problems ? dayEntry.problems.map((p) => p.problemId) : [];
  const problems = await Problem.find({ _id: { $in: problemIds } })
    .select('name difficulty topic leetcodeSlug slug gfgUrl isPremium isOptional')
    .lean();

  // Filter to core problems (with valid links) — same as scheduleController
  const coreProblems = problems.filter(p => {
    return isValidProblem(p) && !p.isOptional && !p.isPremium;
  });
  const mandatoryProblems = coreProblems;

  const completedIds = new Set(
    (progressDoc?.completed || []).map((c) => c.problemId.toString())
  );

  // Count only mandatory problems that are completed
  const mandatoryCompleted = mandatoryProblems.filter((p) => completedIds.has(p._id.toString()));

  return {
    coreAssigned: mandatoryProblems.length,
    coreCompleted: mandatoryCompleted.length,
    allDone: mandatoryCompleted.length >= mandatoryProblems.length && mandatoryProblems.length > 0,
    problems: coreProblems.map((p) => ({
      ...p,
      solved: completedIds.has(p._id.toString()),
      isOptional: !!(p.isOptional || p.isPremium),
    })),
  };
};

/**
 * Batch version: preloads all Problem docs for multiple day entries at once.
 * Returns a map: userId -> { coreAssigned, coreCompleted, allDone }
 */
const batchComputeDayCounts = async (scheduleMap, progressMap) => {
  // Collect ALL problem IDs across all schedule entries
  const allProblemIds = new Set();
  for (const uid of Object.keys(scheduleMap)) {
    const entry = scheduleMap[uid];
    if (entry?.problemIds) {
      entry.problemIds.forEach((id) => allProblemIds.add(id.toString()));
    }
  }

  // Single batch fetch of all problems
  const allProblems = await Problem.find({ _id: { $in: [...allProblemIds] } })
    .select('name difficulty topic leetcodeSlug slug gfgUrl isPremium isOptional')
    .lean();
  const problemMap = {};
  allProblems.forEach((p) => { problemMap[p._id.toString()] = p; });

  const result = {};

  for (const uid of Object.keys(scheduleMap)) {
    const entry = scheduleMap[uid];
    if (!entry?.problemIds) {
      result[uid] = { coreAssigned: 0, coreCompleted: 0, allDone: false };
      continue;
    }

    const problems = entry.problemIds.map((id) => problemMap[id.toString()]).filter(Boolean);
    const coreProblems = problems.filter(p => {
      return isValidProblem(p) && !p.isOptional && !p.isPremium;
    });
    const mandatoryProblems = coreProblems;

    const progress = progressMap[uid];
    const completedIds = new Set(
      (progress?.completed || []).map((c) => c.problemId.toString())
    );

    const mandatoryCompleted = mandatoryProblems.filter((p) => completedIds.has(p._id.toString()));

    result[uid] = {
      coreAssigned: mandatoryProblems.length,
      coreCompleted: mandatoryCompleted.length,
      allDone: mandatoryCompleted.length >= mandatoryProblems.length && mandatoryProblems.length > 0,
      dayNumber: entry.dayNumber,
      type: entry.type,
    };
  }

  return result;
};

// ─── 1. Dashboard Overview (KPIs) ────────────────────────────────────────────
const getDashboardOverview = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ isBanned: { $ne: true } });
    const totalBanned = await User.countDocuments({ isBanned: true });
    const onboardedUsers = await User.countDocuments({ onboardingComplete: true, isBanned: { $ne: true } });

    // Users active in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeToday = await User.countDocuments({ lastActiveAt: { $gte: oneDayAgo }, isBanned: { $ne: true } });

    // Aggregate streak stats (don't use totalSolved from User — compute from Progress)
    const streakAgg = await User.aggregate([
      { $match: { isBanned: { $ne: true }, onboardingComplete: true } },
      {
        $group: {
          _id: null,
          avgStreak: { $avg: '$currentStreak' },
          maxStreak: { $max: '$longestStreak' },
        },
      },
    ]);
    const streakStats = streakAgg[0] || { avgStreak: 0, maxStreak: 0 };

    // Compute REAL total solved across the platform from Progress docs (deduplicated)
    const allProgress = await Progress.find({ 'completed.0': { $exists: true } })
      .select('userId completed.problemId')
      .lean();
    
    const rawUniqueSolvedIds = new Set();
    allProgress.forEach((p) => {
      p.completed.forEach((c) => rawUniqueSolvedIds.add(c.problemId.toString()));
    });
    
    // Filter out optional/premium problems
    const coreProblemsAtPlatform = await Problem.find({ 
      _id: { $in: [...rawUniqueSolvedIds] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).select('_id').lean();
    const coreProblemIdsSet = new Set(coreProblemsAtPlatform.map(p => p._id.toString()));

    const totalSolvedPlatform = coreProblemIdsSet.size;

    // Average solved per user
    const perUserSolved = {};
    allProgress.forEach((p) => {
      const uid = p.userId?.toString();
      if (uid) {
        if (!perUserSolved[uid]) perUserSolved[uid] = new Set();
        p.completed.forEach((c) => {
          const pid = c.problemId.toString();
          if (coreProblemIdsSet.has(pid)) {
            perUserSolved[uid].add(pid);
          }
        });
      }
    });
    const userSolveCounts = Object.values(perUserSolved).map((s) => s.size);
    const avgSolved = userSolveCounts.length > 0
      ? Math.round((userSolveCounts.reduce((a, b) => a + b, 0) / userSolveCounts.length) * 10) / 10
      : 0;

    // Today's completion snapshot — use the accurate counting
    const today = getEffectiveTodayIST();
    const todayStr = toISTDateString(today);

    const onboardedUserIds = await User.find({ onboardingComplete: true, isBanned: { $ne: true } })
      .select('_id').lean();
    const uids = onboardedUserIds.map((u) => u._id);

    const todayProgressDocs = await Progress.find({ userId: { $in: uids }, date: today }).lean();
    const todayProgressMap = {};
    todayProgressDocs.forEach((p) => { todayProgressMap[p.userId.toString()] = p; });

    const schedules = await Schedule.find({ userId: { $in: uids } }).lean();
    const schedMap = {};
    schedules.forEach((s) => {
      const dayEntry = s.days?.find((d) => toISTDateString(new Date(d.date)) === todayStr);
      if (dayEntry) {
        schedMap[s.userId.toString()] = {
          problemIds: dayEntry.problems ? dayEntry.problems.map((p) => p.problemId) : [],
          dayNumber: dayEntry.dayNumber,
          type: dayEntry.type,
        };
      }
    });

    const accurateCounts = await batchComputeDayCounts(schedMap, todayProgressMap);

    let completedToday = 0;
    let inProgressToday = 0;
    for (const uid of Object.keys(accurateCounts)) {
      const c = accurateCounts[uid];
      if (c.allDone) completedToday++;
      else if (c.coreCompleted > 0) inProgressToday++;
    }

    // Daily active users trend (last 14 days)
    const dailyActiveTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const progressCount = await Progress.countDocuments({
        date: d,
        'completed.0': { $exists: true },
      });
      dailyActiveTrend.push({
        date: d.toISOString().split('T')[0],
        count: progressCount,
      });
    }

    // New signups (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newSignups = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalBanned,
        onboardedUsers,
        activeToday,
        completedToday,
        inProgressToday,
        avgStreak: Math.round((streakStats.avgStreak || 0) * 10) / 10,
        maxStreak: streakStats.maxStreak || 0,
        totalSolvedPlatform,
        avgSolved,
        newSignups,
        dailyActiveTrend,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 2. All Users (Paginated + Search/Sort) ──────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const { search, sort = 'lastActiveAt', order = 'desc', page = 1, limit = 20, filter } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { leetcodeUsername: { $regex: search, $options: 'i' } },
      ];
    }
    if (filter === 'banned') query.isBanned = true;
    else if (filter === 'active') query.isBanned = { $ne: true };
    else if (filter === 'onboarded') query.onboardingComplete = true;
    else if (filter === 'not-onboarded') query.onboardingComplete = false;

    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .select('name email avatar leetcodeUsername dailyGoal startDate currentStreak longestStreak totalSolved lastActiveAt onboardingComplete isBanned bannedAt banReason createdAt isAdmin')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(query);

    const userIds = users.map((u) => u._id);

    // Get ALL progress docs for these users to calculate realTotalSolved
    const allProgressDocs = await Progress.find({ userId: { $in: userIds }, 'completed.0': { $exists: true } }).select('userId completed.problemId').lean();
    
    // Calculate realTotalSolved
    const rawSolvedMap = {};
    const allKnownSolvedIds = new Set();
    allProgressDocs.forEach((p) => {
      const uid = p.userId.toString();
      if (!rawSolvedMap[uid]) rawSolvedMap[uid] = new Set();
      p.completed.forEach((c) => {
        const pid = c.problemId.toString();
        rawSolvedMap[uid].add(pid);
        allKnownSolvedIds.add(pid);
      });
    });

    // Filter for core problems
    const coreProblemsAtList = await Problem.find({ 
      _id: { $in: [...allKnownSolvedIds] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).select('_id').lean();
    const coreIdsSet = new Set(coreProblemsAtList.map(p => p._id.toString()));

    const realSolvedMap = {};
    Object.keys(rawSolvedMap).forEach(uid => {
      realSolvedMap[uid] = new Set([...rawSolvedMap[uid]].filter(pid => coreIdsSet.has(pid)));
    });

    // Compute accurate today progress using schedule + progress + problem filtering
    const today = getEffectiveTodayIST();
    const todayStr = toISTDateString(today);

    const todayProgressDocs = await Progress.find({ userId: { $in: userIds }, date: today }).lean();
    const progressMap = {};
    todayProgressDocs.forEach((p) => { progressMap[p.userId.toString()] = p; });

    const schedules = await Schedule.find({ userId: { $in: userIds } }).lean();
    const schedMap = {};
    schedules.forEach((s) => {
      const dayEntry = s.days?.find((d) => toISTDateString(new Date(d.date)) === todayStr);
      if (dayEntry) {
        schedMap[s.userId.toString()] = {
          problemIds: dayEntry.problems ? dayEntry.problems.map((p) => p.problemId) : [],
          dayNumber: dayEntry.dayNumber,
          type: dayEntry.type,
        };
      }
    });

    const accurateCounts = await batchComputeDayCounts(schedMap, progressMap);

    const enrichedUsers = users.map((u) => {
      const uid = u._id.toString();
      const counts = accurateCounts[uid];
      return {
        ...u,
        realTotalSolved: realSolvedMap[uid]?.size || 0,
        todayProgress: counts ? {
          assignedToday: counts.coreAssigned,
          completedToday: counts.coreCompleted,
          allDone: counts.allDone,
        } : null,
      };
    });

    res.json({
      success: true,
      data: enrichedUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 3. Single User Detail ───────────────────────────────────────────────────
const getUserDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-__v -googleId').lean();
    if (!user) return next(createError('User not found', 404));

    // Schedule metadata
    const schedule = await Schedule.findOne({ userId: id })
      .select('generatedAt totalDays dailyGoal')
      .lean();

    // Stats (heatmap + topic breakdown) — use UNIQUE problem IDs across all days
    const allProgress = await Progress.find({ userId: id }).lean();

    // Today's assignment — use accurate counting
    const today = getEffectiveTodayIST();
    const todayStr = toISTDateString(today);
    let todayAssignment = null;

    if (schedule) {
      const fullSchedule = await Schedule.findOne({ userId: id }).lean();
      const dayEntry = fullSchedule?.days?.find((d) => toISTDateString(new Date(d.date)) === todayStr);

      if (dayEntry) {
        const todayProgress = await Progress.findOne({ userId: id, date: today }).lean();
        const counts = await computeDayCounts(dayEntry, todayProgress);

        // --- CARRY-OVER Logic ---
        const globalCompletedBeforeToday = new Set();
        allProgress.forEach((p) => {
          const pDateStr = toISTDateString(new Date(p.date));
          if (pDateStr < todayStr) {
            (p.completed || []).forEach(c => globalCompletedBeforeToday.add(c.problemId.toString()));
          }
        });

        const problemIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
        const alreadyIncludedIds = new Set(problemIds.map(id => id.toString()));
        const carryoverProblemIds = [];

        for (const pastDay of fullSchedule.days || []) {
          const pastDayStr = toISTDateString(new Date(pastDay.date));
          if (pastDayStr >= todayStr) continue;

          const pastAssignedIds = pastDay.problems
            ? pastDay.problems.map(p => p.problemId.toString())
            : (pastDay.problemIds || []).map(id => id.toString());

          for (const pid of pastAssignedIds) {
            if (!globalCompletedBeforeToday.has(pid) && !alreadyIncludedIds.has(pid)) {
              if (isValidProblem({ leetcodeSlug: 'mock', gfgUrl: 'mock' })) { // We use actual Problem filtering later
                 carryoverProblemIds.push(pid);
                 alreadyIncludedIds.add(pid);
              }
            }
          }
        }

        let carryoverProblems = [];
        if (carryoverProblemIds.length > 0) {
           const dbCarryProbs = await Problem.find({ _id: { $in: carryoverProblemIds } }).lean();
           carryoverProblems = dbCarryProbs.filter(isValidProblem).map((p) => {
             const isOptional = p.isOptional || !!(p.leetcodeSlug && p.isPremium);
             const SolvedIds = new Set((todayProgress?.completed || []).map(c => c.problemId.toString()));
             return {
                 ...p,
                 solved: SolvedIds.has(p._id.toString()),
                 isOptional,
                 isCarryover: true
             };
           }).filter(p => !p.isOptional);
        }

        todayAssignment = {
          dayNumber: dayEntry.dayNumber,
          type: dayEntry.type,
          problems: [...counts.problems, ...carryoverProblems],
          totalAssigned: counts.coreAssigned + carryoverProblems.length,
          totalCompleted: counts.coreCompleted + carryoverProblems.filter(p => p.solved).length,
          allDone: (counts.coreCompleted + carryoverProblems.filter(p => p.solved).length) >= (counts.coreAssigned + carryoverProblems.length) && (counts.coreAssigned + carryoverProblems.length) > 0,
        };
      }
    }

    const heatmap = {};
    const istFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

    allProgress.forEach((p) => {
      const key = istFormatter.format(new Date(p.date));
      heatmap[key] = p.isRestDay ? -1 : p.completed.length;
    });

    // Deduplicate: count each unique problem only once
    const uniqueCompletedIds = new Set();
    allProgress.forEach((p) => {
      p.completed.forEach((c) => uniqueCompletedIds.add(c.problemId.toString()));
    });
    
    // Fetch and filter for core problems
    const completedProblems = await Problem.find({ 
      _id: { $in: [...uniqueCompletedIds] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).lean();

    const topicMap = {};
    completedProblems.forEach((p) => {
      if (!topicMap[p.topic]) topicMap[p.topic] = { easy: 0, medium: 0, hard: 0, total: 0 };
      const diff = p.difficulty.toLowerCase();
      topicMap[p.topic][diff] = (topicMap[p.topic][diff] || 0) + 1;
      topicMap[p.topic].total += 1;
    });

    const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
    completedProblems.forEach((p) => {
      difficulties[p.difficulty] = (difficulties[p.difficulty] || 0) + 1;
    });

    const daysActive = allProgress.filter((p) => p.completed.length > 0).length;
    const realTotalSolved = completedProblems.length;

    // Recent activity (last 15 progress entries)
    const recentActivity = allProgress
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15)
      .map((p) => ({
        date: p.date,
        dayNumber: p.dayNumber,
        assigned: p.assigned?.length || 0,
        completed: p.completed?.length || 0,
        notesCount: p.notes?.length || 0,
        bookmarksCount: p.bookmarked?.length || 0,
        allDone: p.allDone || false,
        isRestDay: p.isRestDay || false,
      }));

    res.json({
      success: true,
      data: {
        user: { ...user, realTotalSolved },
        schedule: schedule ? { generatedAt: schedule.generatedAt, totalDays: schedule.totalDays, dailyGoal: schedule.dailyGoal } : null,
        todayAssignment,
        stats: {
          daysActive,
          heatmap,
          topicBreakdown: topicMap,
          difficultyDistribution: difficulties,
        },
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 4. Today Snapshot ───────────────────────────────────────────────────────
const getTodaySnapshot = async (req, res, next) => {
  try {
    const today = getEffectiveTodayIST();
    const todayStr = toISTDateString(today);

    // Get all onboarded, non-banned users
    const users = await User.find({ onboardingComplete: true, isBanned: { $ne: true } })
      .select('name email avatar leetcodeUsername currentStreak totalSolved lastActiveAt')
      .lean();

    const userIds = users.map((u) => u._id);

    // Get today's progress for all users
    const progressDocs = await Progress.find({ userId: { $in: userIds }, date: today }).lean();
    const progressMap = {};
    progressDocs.forEach((p) => { progressMap[p.userId.toString()] = p; });

    // Get schedule entries for today
    const schedules = await Schedule.find({ userId: { $in: userIds } }).lean();
    const schedMap = {};
    schedules.forEach((s) => {
      const dayEntry = s.days?.find((d) => toISTDateString(new Date(d.date)) === todayStr);
      if (dayEntry) {
        schedMap[s.userId.toString()] = {
          problemIds: dayEntry.problems ? dayEntry.problems.map((p) => p.problemId) : [],
          dayNumber: dayEntry.dayNumber,
          type: dayEntry.type,
        };
      }
    });

    // Batch compute accurate counts
    const accurateCounts = await batchComputeDayCounts(schedMap, progressMap);

    const completed = [];
    const inProgress = [];
    const inactive = [];

    users.forEach((u) => {
      const uid = u._id.toString();
      const counts = accurateCounts[uid];

      const entry = {
        ...u,
        assignedCount: counts?.coreAssigned || 0,
        completedCount: counts?.coreCompleted || 0,
        dayNumber: counts?.dayNumber || null,
        dayType: counts?.type || null,
        allDone: counts?.allDone || false,
      };

      if (counts?.allDone) {
        completed.push(entry);
      } else if ((counts?.coreCompleted || 0) > 0) {
        inProgress.push(entry);
      } else {
        inactive.push(entry);
      }
    });

    // Sort each bucket
    completed.sort((a, b) => b.completedCount - a.completedCount);
    inProgress.sort((a, b) => b.completedCount - a.completedCount);
    inactive.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

    res.json({
      success: true,
      data: {
        date: todayStr,
        summary: {
          totalUsers: users.length,
          completed: completed.length,
          inProgress: inProgress.length,
          inactive: inactive.length,
          completionRate: users.length > 0 ? Math.round((completed.length / users.length) * 100) : 0,
        },
        completed,
        inProgress,
        inactive,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 5. Platform Stats ───────────────────────────────────────────────────────
const getPlatformStats = async (req, res, next) => {
  try {
    // Problems solved per day (last 30 days)
    const today = getEffectiveTodayIST();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const progressInLastMonth = await Progress.find({ 
      date: { $gte: thirtyDaysAgo, $lte: today } 
    }).lean();

    // Collect all problem IDs solved in the last month to filter them
    const monthlyProblemIds = new Set();
    progressInLastMonth.forEach(p => {
      (p.completed || []).forEach(c => monthlyProblemIds.add(c.problemId.toString()));
    });

    const coreMonthlyProblems = await Problem.find({
      _id: { $in: [...monthlyProblemIds] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).select('_id').lean();
    const coreMonthlyIdsSet = new Set(coreMonthlyProblems.map(p => p._id.toString()));

    const solvedPerDay = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const dStrLabel = toISTDateString(d);
      const docsForDay = progressInLastMonth.filter(p => toISTDateString(new Date(p.date)) === dStrLabel);
      
      let dailyCoreSolved = 0;
      docsForDay.forEach(p => {
        (p.completed || []).forEach(c => {
          if (coreMonthlyIdsSet.has(c.problemId.toString())) {
            dailyCoreSolved++;
          }
        });
      });

      const activeUsers = docsForDay.filter((p) => (p.completed || []).some(c => coreMonthlyIdsSet.has(c.problemId.toString()))).length;

      solvedPerDay.push({
        date: dStrLabel,
        solved: dailyCoreSolved,
        activeUsers,
      });
    }

    // Difficulty distribution across all solved problems (DEDUPLICATED)
    const allProgress = await Progress.find({ 'completed.0': { $exists: true } })
      .select('completed.problemId')
      .lean();
    const rawUniqueCompletedIds = new Set();
    allProgress.forEach((p) => {
      p.completed.forEach((c) => rawUniqueCompletedIds.add(c.problemId.toString()));
    });

    const allCompletedProblems = await Problem.find({ 
      _id: { $in: [...rawUniqueCompletedIds] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).lean();

    const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
    const topicPopularity = {};
    allCompletedProblems.forEach((p) => {
      difficulties[p.difficulty] = (difficulties[p.difficulty] || 0) + 1;
      topicPopularity[p.topic] = (topicPopularity[p.topic] || 0) + 1;
    });

    // Sort topics by popularity
    const topTopics = Object.entries(topicPopularity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([topic, count]) => ({ topic, count }));

    // Daily goal distribution
    const goalDist = await User.aggregate([
      { $match: { onboardingComplete: true, isBanned: { $ne: true } } },
      { $group: { _id: '$dailyGoal', count: { $sum: 1 } } },
    ]);

    // Total problems in the platform (CORE + LINKED ONLY)
    const totalProblems = await Problem.countDocuments({ 
      isOptional: { $ne: true }, 
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    });

    res.json({
      success: true,
      data: {
        solvedPerDay,
        difficultyDistribution: difficulties,
        topTopics,
        goalDistribution: goalDist,
        totalProblems,
        totalUniqueSolved: allCompletedProblems.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 6. Leaderboard ──────────────────────────────────────────────────────────
const getLeaderboard = async (req, res, next) => {
  try {
    const { sortBy = 'totalSolved', limit = 50 } = req.query;

    // Get all eligible users
    const users = await User.find({ onboardingComplete: true, isBanned: { $ne: true } })
      .select('name email avatar leetcodeUsername currentStreak longestStreak totalSolved lastActiveAt dailyGoal')
      .lean();

    const userIds = users.map((u) => u._id);

    // Compute REAL solved count per user from Progress docs (deduplicated)
    const allProgress = await Progress.find({
      userId: { $in: userIds },
      'completed.0': { $exists: true },
    })
      .select('userId completed.problemId')
      .lean();

    const rawUserSolved = {};
    const perUserDaysActive = {};
    const allSolvedIdsAcrossLeaderboard = new Set();
    allProgress.forEach((p) => {
      const uid = p.userId.toString();
      if (!rawUserSolved[uid]) rawUserSolved[uid] = new Set();
      if (!perUserDaysActive[uid]) perUserDaysActive[uid] = 0;
      p.completed.forEach((c) => {
        const pid = c.problemId.toString();
        rawUserSolved[uid].add(pid);
        allSolvedIdsAcrossLeaderboard.add(pid);
      });
      perUserDaysActive[uid]++;
    });

    // Batch metadata check for core problems
    const coreProblemsAtLeaderboard = await Problem.find({ 
      _id: { $in: [...allSolvedIdsAcrossLeaderboard] },
      isOptional: { $ne: true },
      isPremium: { $ne: true },
      $or: [
        { leetcodeSlug: { $type: "string", $nin: ["", "null"] } },
        { gfgUrl: { $type: "string", $nin: ["", "null"] } },
        { gfgLink: { $type: "string", $nin: ["", "null"] } }
      ]
    }).select('_id').lean();
    const coreIdsSetLeaderboard = new Set(coreProblemsAtLeaderboard.map(p => p._id.toString()));

    // Filter per-user solved sets
    const perUserSolved = {};
    Object.keys(rawUserSolved).forEach(uid => {
      perUserSolved[uid] = new Set(
        [...rawUserSolved[uid]].filter(pid => coreIdsSetLeaderboard.has(pid))
      );
    });

    // Enrich users with real counts
    const enrichedUsers = users.map((u) => {
      const uid = u._id.toString();
      return {
        ...u,
        realTotalSolved: perUserSolved[uid]?.size || 0,
        daysActive: perUserDaysActive[uid] || 0,
      };
    });

    // Sort by the chosen field using REAL data
    const validSorts = ['totalSolved', 'currentStreak', 'longestStreak'];
    const sortField = validSorts.includes(sortBy) ? sortBy : 'totalSolved';

    enrichedUsers.sort((a, b) => {
      if (sortField === 'totalSolved') {
        return b.realTotalSolved - a.realTotalSolved;
      }
      return (b[sortField] || 0) - (a[sortField] || 0);
    });

    // Apply limit and assign ranks
    const leaderboard = enrichedUsers.slice(0, parseInt(limit)).map((u, idx) => ({
      rank: idx + 1,
      ...u,
    }));

    res.json({ success: true, data: leaderboard });
  } catch (err) {
    next(err);
  }
};

// ─── 7. User Activity Log ────────────────────────────────────────────────────
const getUserActivityLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(id).select('name email').lean();
    if (!user) return next(createError('User not found', 404));

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalDocs = await Progress.countDocuments({ userId: id });
    const progressDocs = await Progress.find({ userId: id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('completed.problemId', 'name difficulty topic')
      .lean();

    const activity = progressDocs.map((p) => ({
      date: p.date,
      dayNumber: p.dayNumber,
      assignedCount: p.assigned?.length || 0,
      completedCount: p.completed?.length || 0,
      completedProblems: (p.completed || []).map((c) => ({
        name: c.problemId?.name || 'Unknown',
        difficulty: c.problemId?.difficulty || 'Unknown',
        topic: c.problemId?.topic || 'Unknown',
        solvedAt: c.solvedAt,
        verifiedViaLC: c.verifiedViaLC,
      })),
      notesCount: p.notes?.length || 0,
      bookmarksCount: p.bookmarked?.length || 0,
      allDone: p.allDone || false,
      isRestDay: p.isRestDay || false,
    }));

    res.json({
      success: true,
      data: {
        user,
        activity,
        pagination: {
          total: totalDocs,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalDocs / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── 8. Ban / Unban User ─────────────────────────────────────────────────────
const toggleBanUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);
    if (!user) return next(createError('User not found', 404));
    if (user.isAdmin) return next(createError('Cannot ban an admin user.', 400));

    if (user.isBanned) {
      // Unban
      user.isBanned = false;
      user.bannedAt = null;
      user.banReason = null;
      await user.save();
      return res.json({ success: true, message: `${user.name} has been unbanned.`, isBanned: false });
    } else {
      // Ban
      user.isBanned = true;
      user.bannedAt = new Date();
      user.banReason = reason || 'No reason provided';
      await user.save();
      return res.json({ success: true, message: `${user.name} has been banned.`, isBanned: true });
    }
  } catch (err) {
    next(err);
  }
};

// ─── 9. Admin Mark Problem Solved ────────────────────────────────────────────
const adminMarkProblem = async (req, res, next) => {
  try {
    const { userId, problemId, solved } = req.body;

    const user = await User.findById(userId);
    if (!user) return next(createError('User not found', 404));

    const problem = await Problem.findById(problemId);
    if (!problem) return next(createError('Problem not found', 404));

    const today = getEffectiveTodayIST();

    // Find or create today's progress
    let progress = await Progress.findOne({ userId, date: today });
    if (!progress) {
      const schedule = await Schedule.findOne({ userId }).lean();
      const todayStr = toISTDateString(today);
      const dayEntry = schedule?.days?.find((d) => toISTDateString(new Date(d.date)) === todayStr);

      // Filter assigned to valid problems only
      const rawAssignedIds = dayEntry?.problems?.map((p) => p.problemId) || [];
      const populatedProblems = await Problem.find({ _id: { $in: rawAssignedIds } }).lean();
      const validAssignedIds = populatedProblems
        .filter(isValidProblem)
        .map((p) => p._id.toString());

      progress = await Progress.create({
        userId,
        date: today,
        dayNumber: dayEntry?.dayNumber || 0,
        assigned: validAssignedIds,
      });
    }

    if (solved) {
      const already = progress.completed.find((c) => c.problemId.toString() === problemId);
      if (!already) {
        progress.completed.push({ problemId, solvedAt: new Date(), verifiedViaLC: false });
        await User.findByIdAndUpdate(userId, { $inc: { totalSolved: 1 } });
      }
    } else {
      const idx = progress.completed.findIndex((c) => c.problemId.toString() === problemId);
      if (idx !== -1) {
        progress.completed.splice(idx, 1);
        await User.findByIdAndUpdate(userId, { $inc: { totalSolved: -1 } });
      }
    }

    progress.allDone = progress.completed.length >= progress.assigned.length;
    await progress.save();

    if (solved) {
      await updateStreak(userId);
    }

    res.json({
      success: true,
      message: `Problem ${solved ? 'marked as solved' : 'unmarked'} for ${user.name}.`,
      data: progress,
    });
  } catch (err) {
    next(err);
  }
};

const getReports = async (req, res, next) => {
  try {
    const { status = 'pending', page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = { status };
    const reports = await Report.find(query)
      .populate('userId', 'username email')
      .populate('problemId', 'name difficulty topic leetcodeSlug isOptional')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
      
    const total = await Report.countDocuments(query);
    
    res.json({ success: true, data: reports, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (e) { next(e); }
};

const resolveReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return next(createError('Report not found', 404));
    
    report.status = 'resolved';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    await report.save();
    
    res.json({ success: true, message: 'Report marked resolved' });
  } catch(e) { next(e); }
};

const updateProblemAdmin = async (req, res, next) => {
  try {
    const { name, leetcodeSlug, difficulty, topic, isOptional } = req.body;
    const problem = await Problem.findByIdAndUpdate(
       req.params.id, 
       { name, leetcodeSlug, difficulty, topic, isOptional }, 
       { new: true }
    );
    if (!problem) return next(createError('Problem not found', 404));
    
    res.json({ success: true, message: 'Problem updated successfully', data: problem });
  } catch(e) { next(e); }
};

const getUserFullSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findOne({ userId: id })
      .populate('days.problems.problemId', 'name difficulty topic leetcodeSlug slug gfgUrl youtubeUrl resourceUrl source isPremium isOptional')
      .lean();

    if (!schedule) {
      return res.json({ success: true, data: [] });
    }

    const progressDocs = await Progress.find({ userId: id })
      .select('date allDone completed')
      .lean();

    const progressMap = {};
    progressDocs.forEach((p) => {
      const key = new Date(p.date).toISOString().split('T')[0];
      progressMap[key] = { allDone: p.allDone, completedCount: p.completed.length, completedIds: p.completed.map(c => c.problemId.toString()) };
    });

    const enrichedDays = schedule.days.map((d) => {
      const key = new Date(d.date).toISOString().split('T')[0];
      const prog = progressMap[key] || {};
      const completedSet = new Set(prog.completedIds || []);
      
      const enrichedProblems = d.problems ? d.problems.map(sp => ({
        ...sp,
        solved: completedSet.has(sp.problemId?._id?.toString())
      })) : [];

      return {
        ...d,
        problems: enrichedProblems,
        allDone: prog.allDone || false,
        completedCount: prog.completedCount || 0,
        problemCount: d.problems ? d.problems.length : (d.problemIds?.length || 0),
      };
    });

    res.json({ success: true, data: enrichedDays });
  } catch (err) {
    next(err);
  }
};

const adminReplaceProblem = async (req, res, next) => {
  try {
    const { id: userId } = req.params;
    const { problemId } = req.body;
    
    const schedule = await Schedule.findOne({ userId });
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

    // Sync Progress docs across occurrences
    const progressDates = dayOccurrences.map(occ => new Date(occ.day.date));
    const progresses = await Progress.find({ userId, date: { $in: progressDates } });
    
    let isUserTotalSolvedDecremented = false;

    for (const progress of progresses) {
      let isChanged = false;
      
      // 1. Replace in assigned
      const pIndex = progress.assigned.findIndex(id => id.toString() === problemId);
      if (pIndex !== -1) {
        progress.assigned[pIndex] = replacement._id;
        isChanged = true;
      }

      // 2. Handle if it was already solved
      const cIndex = progress.completed.findIndex(c => c.problemId.toString() === problemId);
      if (cIndex !== -1) {
        progress.completed = progress.completed.filter(c => c.problemId.toString() !== problemId);
        if (!isUserTotalSolvedDecremented) {
          const user = await User.findById(userId);
          if (user) {
            user.totalSolved = Math.max(0, (user.totalSolved || 0) - 1);
            await user.save();
            isUserTotalSolvedDecremented = true;
          }
        }
        isChanged = true;
      }

      // 3. Handle bookmarks
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

    res.json({ success: true, message: 'Problem regenerated successfully.', data: replacement });
  } catch(err) { next(err); }
};

const adminRemoveProblem = async (req, res, next) => {
  try {
    const { id: userId } = req.params;
    const { problemId } = req.body;
    
    const schedule = await Schedule.findOne({ userId });
    if (!schedule) return next(createError('Schedule not found', 404));

    let removed = false;

    for (const day of schedule.days) {
      if (day.problems) {
        const initialLength = day.problems.length;
        day.problems = day.problems.filter(p => p.problemId.toString() !== problemId);
        if (day.problems.length !== initialLength) removed = true;
      } else if (day.problemIds) {
        const initialLength = day.problemIds.length;
        day.problemIds = day.problemIds.filter(id => id.toString() !== problemId);
        if (day.problemIds.length !== initialLength) removed = true;
      }
    }

    if (!removed) return next(createError('Problem not found in schedule', 404));

    schedule.markModified('days');
    await schedule.save();

    // Sync Progress docs across all occurrences
    const progresses = await Progress.find({ userId });
    
    let isUserTotalSolvedDecremented = false;

    for (const progress of progresses) {
      let isChanged = false;
      
      const pIndex = progress.assigned.findIndex(id => id.toString() === problemId);
      if (pIndex !== -1) {
        progress.assigned = progress.assigned.filter(id => id.toString() !== problemId);
        isChanged = true;
      }

      const cIndex = progress.completed.findIndex(c => c.problemId.toString() === problemId);
      if (cIndex !== -1) {
        progress.completed = progress.completed.filter(c => c.problemId.toString() !== problemId);
        if (!isUserTotalSolvedDecremented) {
          const user = await User.findById(userId);
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
        progress.allDone = progress.assigned.length === 0 ? false : progress.completed.length >= progress.assigned.length;
        await progress.save();
      }
    }

    res.json({ success: true, message: 'Problem removed successfully.' });
  } catch(err) { next(err); }
};

module.exports = {
  getDashboardOverview,
  getAllUsers,
  getUserDetail,
  getTodaySnapshot,
  getPlatformStats,
  getLeaderboard,
  getUserActivityLog,
  toggleBanUser,
  adminMarkProblem,
  getReports,
  resolveReport,
  updateProblemAdmin,
  getUserFullSchedule,
  adminReplaceProblem,
  adminRemoveProblem,
};
