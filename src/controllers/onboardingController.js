const User = require('../models/User');
const axios = require('axios');
const { generateSchedule } = require('../services/scheduleEngine');
const { validationResult } = require('express-validator');
const { createError } = require('../middleware/errorHandler');

const Schedule = require('../models/Schedule');

const completeOnboarding = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(createError(errors.array()[0].msg, 400, 'VALIDATION_ERROR'));
    }

    const { leetcodeUsername, startDate, dailyGoal, totalDays, forceReset } = req.body;

    // Check if schedule already exists
    const existingSchedule = await Schedule.findOne({ userId: req.user._id });
    if (existingSchedule && !forceReset) {
      return next(createError('Roadmap already exists. Please use the Profile page to reset or reschedule.', 400, 'SCHEDULE_EXISTS'));
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { leetcodeUsername, startDate, dailyGoal, totalDays, onboardingComplete: true, lastActiveAt: new Date() },
      { new: true }
    );

    // Generate schedule asynchronously
    generateSchedule(user._id, startDate, dailyGoal, totalDays || 90).catch((err) => {
      console.error('Schedule generation error:', err.message);
    });

    res.json({
      success: true,
      message: "Onboarding complete! Your schedule is being generated.",
      user: {
        _id: user._id,
        name: user.name,
        leetcodeUsername: user.leetcodeUsername,
        startDate: user.startDate,
        dailyGoal: user.dailyGoal,
        totalDays: user.totalDays,
        onboardingComplete: user.onboardingComplete,
      },
    });
  } catch (err) {
    next(err);
  }
};

const validateLeetCodeUsername = async (req, res, next) => {
  try {
    const { username } = req.params;
    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile { realName }
          submitStats { acSubmissionNum { difficulty count } }
        }
      }
    `;

    const response = await axios.post(
      'https://leetcode.com/graphql',
      { query, variables: { username } },
      { headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' }, timeout: 5000 }
    );

    const lcUser = response.data?.data?.matchedUser;
    if (!lcUser) {
      return res.json({ success: false, valid: false, message: 'Username not found on LeetCode.' });
    }

    res.json({
      success: true,
      valid: true,
      username: lcUser.username,
      totalSolved: lcUser.submitStats?.acSubmissionNum?.[0]?.count || 0,
    });
  } catch {
    res.json({ success: true, valid: null, message: 'Could not verify (LeetCode may be slow). You can continue.' });
  }
};

module.exports = { completeOnboarding, validateLeetCodeUsername };
