const Schedule = require('../models/Schedule');
const Progress = require('../models/Progress');
const Problem = require('../models/Problem');
const { createError } = require('../middleware/errorHandler');

const getTodayISTStr = () => {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }); // sv-SE gives YYYY-MM-DD reliably
};

const getToday = async (req, res, next) => {
  try {
    const schedule = await Schedule.findOne({ userId: req.user._id }).lean();
    if (!schedule) return next(createError('Schedule not generated yet.', 404, 'NO_SCHEDULE'));

    const todayStr = getTodayISTStr();
    const dayEntry = schedule.days.find((d) => {
      const dDate = new Date(d.date);
      const dStr = dDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
      return dStr === todayStr;
    });
    if (!dayEntry) return next(createError('No schedule entry for today.', 404, 'NO_DAY_ENTRY'));

    const problemIds = dayEntry.problems ? dayEntry.problems.map(p => p.problemId) : (dayEntry.problemIds || []);
    const problems = await Problem.find({ _id: { $in: problemIds } }).lean();
    
    // Look up progress for this specific IST day
    const dayStart = new Date(todayStr + 'T00:00:00Z');
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
        status: schedProb?.status || 'pending',
        solved: completedIds.has(p._id.toString()),
        bookmarked: bookmarkedIds.has(p._id.toString()),
        note: notesMap[p._id.toString()] || '',
      };
    });

    res.json({
      success: true,
      data: {
        dayNumber: dayEntry.dayNumber,
        date: dayEntry.date,
        type: dayEntry.type,
        problems: enrichedProblems,
        concepts: dayEntry.readings ? dayEntry.readings.map(r => r.title) : (dayEntry.concepts || []),
        readings: dayEntry.readings || [],
        isCompleted: dayEntry.isCompleted || false,
        progress: {
          total: enrichedProblems.length,
          completed: completedIds.size,
          allDone: progress?.allDone || false,
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
      .populate('days.problems.problemId', 'name difficulty topic leetcodeSlug slug gfgUrl')
      .lean();
    
    if (!schedule) {
      return next(createError('Schedule not found', 404, 'NO_SCHEDULE'));
    }

    res.json({ success: true, data: schedule.days });
  } catch (err) {
    next(err);
  }
};

module.exports = { getToday, getDayByNumber, getOverview, getFullSchedule };
