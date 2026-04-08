const Progress = require('../models/Progress');
const Problem = require('../models/Problem');

const getStats = async (req, res, next) => {
  try {
    const user = req.user;
    const allProgress = await Progress.find({ userId: user._id }).lean();

    // Heatmap data: date → count
    // Use UTC date parts explicitly so keys are stable regardless of server timezone
    const heatmap = {};
    allProgress.forEach((p) => {
      const d = new Date(p.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      heatmap[key] = p.completed.length;
    });

    // Topic breakdown
    const completedIds = allProgress.flatMap((p) => p.completed.map((c) => c.problemId));
    const completedProblems = await Problem.find({ _id: { $in: completedIds } }).lean();

    const topicMap = {};
    completedProblems.forEach((p) => {
      if (!topicMap[p.topic]) topicMap[p.topic] = { easy: 0, medium: 0, hard: 0, total: 0 };
      const diff = p.difficulty.toLowerCase();
      topicMap[p.topic][diff] = (topicMap[p.topic][diff] || 0) + 1;
      topicMap[p.topic].total += 1;
    });

    // Difficulty distribution
    const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
    completedProblems.forEach((p) => {
      difficulties[p.difficulty] = (difficulties[p.difficulty] || 0) + 1;
    });

    // Days active
    const daysActive = allProgress.filter((p) => p.completed.length > 0).length;

    res.json({
      success: true,
      data: {
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        totalSolved: user.totalSolved,
        daysActive,
        topicBreakdown: topicMap,
        difficultyDistribution: difficulties,
        heatmap,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats };
