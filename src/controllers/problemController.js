const Problem = require('../models/Problem');
const Progress = require('../models/Progress');
const axios = require('axios');
const { createError } = require('../middleware/errorHandler');

/**
 * Get all problems with filtering and search
 */
const getProblems = async (req, res, next) => {
  try {
    const { topic, difficulty, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (topic && topic !== 'All') query.topic = topic;
    if (difficulty && difficulty !== 'All') query.difficulty = difficulty;
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch problems
    const problems = await Problem.find(query)
      .sort({ topic: 1, difficulty: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Problem.countDocuments(query);

    // Get user's progress to mark solved problems
    const userProgress = await Progress.find({ userId: req.user._id }).select('completed').lean();
    const completedIds = new Set();
    userProgress.forEach(p => {
      p.completed.forEach(c => completedIds.add(c.problemId.toString()));
    });

    const enrichedProblems = problems.map(p => ({
      ...p,
      isSolved: completedIds.has(p._id.toString())
    }));

    res.json({
      success: true,
      data: enrichedProblems,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get unique topics and metadata for filters
 */
const getFilterData = async (req, res, next) => {
  try {
    const topics = await Problem.distinct('topic');
    const difficulties = ['Easy', 'Medium', 'Hard'];
    
    res.json({
      success: true,
      data: {
        topics: topics.sort(),
        difficulties
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Validate a LeetCode problem slug — proxies through our server to dodge CORS.
 * Returns { valid: true/false, gfgUrl } so the frontend can fall back to GFG.
 */
const validateLeetcodeSlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (!slug) return res.json({ valid: false });

    // Fetch matching problem from DB first so we can return its GFG URL
    const problem = await Problem.findOne({ leetcodeSlug: slug }).select('gfgUrl').lean();

    const query = `
      query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          title
        }
      }
    `;

    try {
      const response = await axios.post(
        'https://leetcode.com/graphql',
        { query, variables: { titleSlug: slug } },
        {
          headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
          timeout: 5000,
        }
      );

      const question = response.data?.data?.question;
      const valid = !!question?.questionId;

      return res.json({
        valid,
        gfgUrl: problem?.gfgUrl || null,
      });
    } catch {
      // If LeetCode GraphQL is unreachable, assume valid to avoid false negatives
      return res.json({ valid: true, gfgUrl: problem?.gfgUrl || null });
    }
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProblems,
  getFilterData,
  validateLeetcodeSlug,
};
