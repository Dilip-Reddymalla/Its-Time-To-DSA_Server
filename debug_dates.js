const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getEffectiveTodayIST_FIXED = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  
  let target = now;
  if (istTime.getUTCHours() < 2) {
    target = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(target);

  return new Date(todayStr + 'T00:00:00Z');
};

const toISTDateString = (date) => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Kolkata', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(date || new Date());
};

console.log('--- Date Debugging ---');
console.log('System Current Time (UTC):', new Date().toISOString());
console.log('IST Effective Today (Fixed):', getEffectiveTodayIST_FIXED().toISOString());
console.log('IST Today String (Fixed):', toISTDateString(getEffectiveTodayIST_FIXED()));

const startDate = '2026-04-13'; // Simulating today
const start = new Date(startDate);
start.setUTCHours(0, 0, 0, 0);

console.log('\n--- Schedule Generation Simulation ---');
console.log('Start (UTC):', start.toISOString());

for (let dayNum = 1; dayNum <= 2; dayNum++) {
  const date = new Date(start);
  date.setUTCDate(start.getUTCDate() + dayNum - 1);
  const dStr = toISTDateString(date);
  console.log(`Day ${dayNum}: ${date.toISOString()} -> String: ${dStr}`);
  
  if (dStr < toISTDateString(getEffectiveTodayIST_FIXED())) {
    console.log(`  [PAST] Day ${dayNum} would carry over.`);
  } else if (dStr === toISTDateString(getEffectiveTodayIST_FIXED())) {
    console.log(`  [TODAY] Day ${dayNum} is active.`);
  } else {
    console.log(`  [FUTURE] Day ${dayNum} is pending.`);
  }
}
