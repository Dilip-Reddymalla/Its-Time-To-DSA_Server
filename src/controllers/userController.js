const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Progress = require('../models/Progress');
const { generateSchedule } = require('../services/scheduleEngine');
const { createError } = require('../middleware/errorHandler');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('name email avatar leetcodeUsername dailyGoal startDate usernameChangeCount');
    if (!user) return next(createError('User not found', 404));

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { leetcodeUsername, dailyGoal, startDate, totalDays, reschedule } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) return next(createError('User not found', 404));

    const updates = {};
    
    // Handle Username Change with Limit
    if (leetcodeUsername && leetcodeUsername !== user.leetcodeUsername) {
      if (user.usernameChangeCount >= 2) {
        return next(createError('LeetCode username can only be changed twice.', 400));
      }
      updates.leetcodeUsername = leetcodeUsername;
      updates.usernameChangeCount = user.usernameChangeCount + 1;
    }

    if (dailyGoal) updates.dailyGoal = dailyGoal;
    if (totalDays) updates.totalDays = totalDays;
    if (startDate) updates.startDate = new Date(startDate);

    // Save user updates
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    // Trigger Reschedule if requested
    if (reschedule) {
      // Find all solved problem IDs to exclude them from the new schedule
      const progressDocs = await Progress.find({ userId: req.user._id });
      const solvedIds = [];
      progressDocs.forEach(p => {
        p.completed.forEach(c => solvedIds.push(c.problemId));
      });

      await generateSchedule(
        req.user._id,
        updates.startDate || user.startDate,
        updates.dailyGoal || user.dailyGoal,
        updates.totalDays || user.totalDays || 90,
        solvedIds
      );
    }

    res.json({ success: true, data: updatedUser, message: reschedule ? 'Profile updated and roadmap rescheduled!' : 'Profile updated successfully!' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProfile, updateProfile };
