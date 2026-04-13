const User = require('../models/User');
const Progress = require('../models/Progress');

const { 
  getEffectiveTodayIST, 
  getEffectiveYesterdayIST, 
  IST_OFFSET_MS 
} = require('../utils/dateUtils');

/**
 * Compute and update streak for a user.
 * Called after progress is updated (verify or manual mark).
 *
 * Rules:
 * - currentStreak increments if ≥1 problem solved today
 * - Streak breaks if 0 solved AND past 11:59 PM IST
 * - Grace period: 2h into next day counts for yesterday
 */
const updateStreak = async (userId) => {
  const user = await User.findById(userId);
  const today = getEffectiveTodayIST();
  const yesterday = getEffectiveYesterdayIST();

  // Count how many problems solved today
  const todayProgress = await Progress.findOne({ userId, date: today });
  const solvedToday = todayProgress?.completed?.length || 0;

  // Check yesterday's progress (for streak continuity)
  const yesterdayProgress = await Progress.findOne({ userId, date: yesterday });
  const solvedYesterday = yesterdayProgress?.completed?.length || 0;

  let { currentStreak, longestStreak } = user;

  if (solvedToday > 0) {
    // If yesterday was solved (or this is day 1), increment streak
    if (solvedYesterday > 0 || currentStreak === 0) {
      currentStreak += 1;
    } else {
      // Gap in streak — reset to 1
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);
  }
  // Note: streak breaking (setting to 0) is handled by a nightly cron job / checked on dashboard load

  await User.findByIdAndUpdate(userId, {
    currentStreak,
    longestStreak,
    lastActiveAt: new Date(),
  });

  return { currentStreak, longestStreak };
};

/**
 * Check and break streaks for users who missed yesterday.
 * Called by a nightly cron job (or on dashboard load for the specific user).
 */
const checkAndBreakStreak = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.currentStreak === 0) return;

  const yesterday = getEffectiveYesterdayIST();
  const yesterdayProgress = await Progress.findOne({ userId, date: yesterday });
  const solvedYesterday = yesterdayProgress?.completed?.length || 0;

  // If yesterday had 0 solved and today is past midnight IST → break streak
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const isAfterMidnight = nowIST.getUTCHours() >= 2; // grace period: 2h

  if (solvedYesterday === 0 && isAfterMidnight) {
    if (user.restTokens > 0) {
      // Consume a rest token to protect the streak
      await User.findByIdAndUpdate(userId, { $inc: { restTokens: -1 } });
      
      if (yesterdayProgress) {
        yesterdayProgress.isRestDay = true;
        await yesterdayProgress.save();
      } else {
        // Create an empty progress with isRestDay to show on heatmap
        const Schedule = require('../models/Schedule');
        const sched = await Schedule.findOne({ userId });
        const dayEntry = sched?.days.find(d => {
          const d2 = new Date(d.date);
          d2.setHours(0,0,0,0);
          return d2.getTime() === yesterday.getTime();
        });
        
        await Progress.create({
          userId,
          date: yesterday,
          dayNumber: dayEntry ? dayEntry.dayNumber : 0,
          isRestDay: true
        });
      }
      return user.currentStreak;
    } else {
      // No tokens left, streak is broken
      await User.findByIdAndUpdate(userId, { currentStreak: 0 });
      return 0;
    }
  }

  return user.currentStreak;
};

module.exports = { updateStreak, checkAndBreakStreak, getEffectiveTodayIST };
