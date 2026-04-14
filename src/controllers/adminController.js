const User = require('../models/User');
const Progress = require('../models/Progress');
const Schedule = require('../models/Schedule');
const Problem = require('../models/Problem');
const Report = require('../models/Report');
const { createError } = require('../middleware/errorHandler');
const { getEffectiveTodayIST, toISTDateString } = require('../utils/dateUtils');

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
    .select('name difficulty topic leetcodeSlug slug gfgUrl isPremium')
    .lean();

  // Filter to core problems (with valid links) — same as scheduleController
  const coreProblems = problems.filter(isValidProblem);
  const mandatoryProblems = coreProblems.filter(p => !(p.leetcodeSlug && p.isPremium));

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
      isOptional: !!(p.leetcodeSlug && p.isPremium),
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
    .select('name difficulty topic leetcodeSlug slug gfgUrl isPremium')
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
    const coreProblems = problems.filter(isValidProblem);
    const mandatoryProblems = coreProblems.filter(p => !(p.leetcodeSlug && p.isPremium));

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
      .select('userId completed')
      .lean();
    
    const uniqueSolvedIds = new Set();
    allProgress.forEach((p) => {
      p.completed.forEach((c) => uniqueSolvedIds.add(c.problemId.toString()));
    });
    const totalSolvedPlatform = uniqueSolvedIds.size;

    // Average solved per user
    const perUserSolved = {};
    allProgress.forEach((p) => {
      const uid = p.userId?.toString();
      if (uid) {
        if (!perUserSolved[uid]) perUserSolved[uid] = new Set();
        p.completed.forEach((c) => perUserSolved[uid].add(c.problemId.toString()));
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
    const allProgressDocs = await Progress.find({ userId: { $in: userIds }, 'completed.0': { $exists: true } }).select('userId completed').lean();
    
    // Calculate realTotalSolved
    const realSolvedMap = {};
    allProgressDocs.forEach((p) => {
      const uid = p.userId.toString();
      if (!realSolvedMap[uid]) realSolvedMap[uid] = new Set();
      p.completed.forEach((c) => realSolvedMap[uid].add(c.problemId.toString()));
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

        todayAssignment = {
          dayNumber: dayEntry.dayNumber,
          type: dayEntry.type,
          problems: counts.problems,
          totalAssigned: counts.coreAssigned,
          totalCompleted: counts.coreCompleted,
          allDone: counts.allDone,
        };
      }
    }

    // Stats (heatmap + topic breakdown) — use UNIQUE problem IDs across all days
    const allProgress = await Progress.find({ userId: id }).lean();
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
    const completedProblems = await Problem.find({ _id: { $in: [...uniqueCompletedIds] } }).lean();

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
    const realTotalSolved = uniqueCompletedIds.size;

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
    const solvedPerDay = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const progressDocs = await Progress.find({ date: d }).lean();
      const totalSolved = progressDocs.reduce((sum, p) => sum + (p.completed?.length || 0), 0);
      const activeUsers = progressDocs.filter((p) => p.completed?.length > 0).length;
      solvedPerDay.push({
        date: d.toISOString().split('T')[0],
        solved: totalSolved,
        activeUsers,
      });
    }

    // Difficulty distribution across all solved problems (DEDUPLICATED)
    const allProgress = await Progress.find({ 'completed.0': { $exists: true } })
      .select('completed')
      .lean();
    const uniqueCompletedIds = new Set();
    allProgress.forEach((p) => {
      p.completed.forEach((c) => uniqueCompletedIds.add(c.problemId.toString()));
    });
    const allCompletedProblems = await Problem.find({ _id: { $in: [...uniqueCompletedIds] } }).lean();

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

    // Total problems in the platform
    const totalProblems = await Problem.countDocuments();

    res.json({
      success: true,
      data: {
        solvedPerDay,
        difficultyDistribution: difficulties,
        topTopics,
        goalDistribution: goalDist,
        totalProblems,
        totalUniqueSolved: uniqueCompletedIds.size,
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
      .select('userId completed')
      .lean();

    const perUserSolved = {};
    const perUserDaysActive = {};
    allProgress.forEach((p) => {
      const uid = p.userId.toString();
      if (!perUserSolved[uid]) perUserSolved[uid] = new Set();
      if (!perUserDaysActive[uid]) perUserDaysActive[uid] = 0;
      p.completed.forEach((c) => perUserSolved[uid].add(c.problemId.toString()));
      perUserDaysActive[uid]++;
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
};
