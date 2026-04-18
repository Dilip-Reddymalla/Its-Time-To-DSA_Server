require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Schedule = require('../src/models/Schedule');

const migrateSundays = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB. Starting migration...');

    const schedules = await Schedule.find({}).lean();
    let updatedCount = 0;

    for (const schedule of schedules) {
      if (!schedule.days || schedule.days.length === 0) continue;

      // Find the index of "today" relative to the user's schedule days
      // For safety, we only modify days that are in the FUTURE (date > today)
      // Actually, if we want them to have rest days from now on, we shift their schedule based on their current day index.
      
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);

      const newDays = [];
      let dateOffset = 0;
      let hasMutated = false;
      let lastProcessedDate = new Date(schedule.days[0].date);

      for (let i = 0; i < schedule.days.length; i++) {
         const d = schedule.days[i];
         const dayDate = new Date(d.date);

         if (dayDate < now) {
            // Past days: keep as is
            newDays.push(d);
            lastProcessedDate = new Date(d.date);
         } else {
            // Today and future days
            if (!hasMutated) {
               // First time transitioning to future
               // We need to base the start date on lastProcessedDate + 1 or 'now'
               // If dayDate == now, then we start offset from here.
               // Otherwise, if dayDate > now and we haven't seen now, it means they have gaps? 
               // Schedule dates are usually contiguous.
               hasMutated = true;
               // We will use dateOffset starting 0 from the original date `dayDate`
            }

            // Figure out the proposed new date for this "work" day
            let proposedDate = new Date(dayDate);
            proposedDate.setUTCDate(proposedDate.getUTCDate() + dateOffset);

            // If it lands on Sunday, insert a Rest Day and shift the work day to Monday
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

            // Now push the actual work day with the shifted date
            d.date = new Date(proposedDate);
            newDays.push(d);
         }
      }

      if (hasMutated && newDays.length > schedule.days.length) {
         await Schedule.updateOne({ _id: schedule._id }, { $set: { days: newDays } });
         updatedCount++;
      }
    }

    console.log(`✅ Migration complete! Updated ${updatedCount} schedules.`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  }
};

migrateSundays();
