const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns a Date object representing the start of the "effective" IST day (00:00:00Z).
 * This accounts for a grace period (e.g., before 1 AM IST counts as the previous day).
 */
const getEffectiveTodayIST = () => {
  const now = new Date();
  
  // Create an IST version of 'now' just to check the hours for the grace period
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  
  let target = now;
  // If it's before 2 AM IST, we consider it to be "yesterday"
  if (istTime.getUTCHours() < 2) {
    target = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(target);

  // Return YYYY-MM-DDT00:00:00Z format used in MongoDB for Progress/Schedule
  return new Date(todayStr + 'T00:00:00Z');
};

/**
 * Formats a date to YYYY-MM-DD in IST.
 */
const toISTDateString = (date) => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(date || new Date());
};

/**
 * Utility to get yesterday's effective date.
 */
const getEffectiveYesterdayIST = () => {
  const today = getEffectiveTodayIST();
  today.setUTCDate(today.getUTCDate() - 1);
  return today;
};

module.exports = {
  getEffectiveTodayIST,
  toISTDateString,
  getEffectiveYesterdayIST,
  IST_OFFSET_MS
};
