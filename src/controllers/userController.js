const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Progress = require('../models/Progress');
const PauseRequest = require('../models/PauseRequest');
const { generateSchedule } = require('../services/scheduleEngine');
const { createError } = require('../middleware/errorHandler');
const { getEffectiveTodayIST } = require('../utils/dateUtils');
const { reconcileRevisionDays } = require('../utils/scheduleUtils');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('name email avatar leetcodeUsername dailyGoal startDate usernameChangeCount sundayRestEnabled');
    if (!user) return next(createError('User not found', 404));

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { leetcodeUsername, dailyGoal, startDate, totalDays, reschedule, sundayRestEnabled } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) return next(createError('User not found', 404));

    const updates = {};
    let scheduleNeedsRestDayShift = false;
    let oldRestDaySetting = user.sundayRestEnabled;
    
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
    
    if (sundayRestEnabled !== undefined && sundayRestEnabled !== user.sundayRestEnabled) {
      updates.sundayRestEnabled = sundayRestEnabled;
      scheduleNeedsRestDayShift = true; // We only shift if they aren't fully rescheduling
    }

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
    } else if (scheduleNeedsRestDayShift) {
      // Dynamically shift only future days without regenerating the whole schedule pool
      const schedule = await Schedule.findOne({ userId: req.user._id });
      if (schedule && schedule.days && schedule.days.length > 0) {
        const now = getEffectiveTodayIST();
        now.setUTCHours(0,0,0,0);
        
        let newDays = [];
        let dateOffset = 0;
        let hasMutated = false;
        
        for (let i = 0; i < schedule.days.length; i++) {
          const d = schedule.days[i];
          const dayDate = new Date(d.date);

          if (dayDate < now) {
            newDays.push(d);
          } else {
            hasMutated = true;
            let proposedDate = new Date(dayDate);
            proposedDate.setUTCDate(proposedDate.getUTCDate() + dateOffset);

            if (sundayRestEnabled === true) {
              // Turning ON: insert rest days on Sundays
              while (proposedDate.getUTCDay() === 0) {
                 newDays.push({
                   dayNumber: d.dayNumber,
                   date: new Date(proposedDate),
                   type: 'rest',
                   isCompleted: false,
                   readings: [{ title: "🏖️ Rest Day — Try LeetCode's Problem of the Day!", type: 'suggestion' }],
                   problems: []
                 });
                 dateOffset++;
                 proposedDate.setUTCDate(proposedDate.getUTCDate() + 1);
              }
              d.date = new Date(proposedDate);
              newDays.push(d);
            } else {
              // Turning OFF: remove rest days, pull dates back
              if (d.type === 'rest') {
                dateOffset--; // pull next days back by 1
              } else {
                d.date = new Date(proposedDate);
                newDays.push(d);
              }
            }
          }
        }

        if (hasMutated) {
          reconcileRevisionDays(newDays);
          schedule.days = newDays;
          schedule.markModified('days');
          await schedule.save();
        }
      }
    }

    res.json({ success: true, data: updatedUser, message: reschedule ? 'Profile updated and roadmap rescheduled!' : 'Profile updated successfully!' });
  } catch (err) {
    next(err);
  }
};

const requestPause = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return next(createError('Reason is required', 400));

    const existing = await PauseRequest.findOne({ userId: req.user._id, status: 'pending' });
    if (existing) {
      return next(createError('You already have a pending pause request.', 400));
    }

    const request = new PauseRequest({
      userId: req.user._id,
      reason
    });
    await request.save();

    res.json({ success: true, message: 'Pause request submitted successfully.' });
  } catch (err) { next(err); }
};

module.exports = { getProfile, updateProfile, requestPause };
