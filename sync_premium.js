const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Problem = require('./src/models/Problem');
const { getProblemPremiumStatus } = require('./src/services/leetcodeService');

dotenv.config();

const syncPremiumStatus = async () => {
  try {
    console.log('--- LeetCode Premium Sync ---');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const leetcodeProblems = await Problem.find({ 
      leetcodeSlug: { $exists: true, $ne: null, $ne: 'null' } 
    });

    console.log(`Found ${leetcodeProblems.length} LeetCode problems to check.`);

    let updatedCount = 0;
    let premiumCount = 0;

    for (let i = 0; i < leetcodeProblems.length; i++) {
      const p = leetcodeProblems[i];
      process.stdout.write(`[${i+1}/${leetcodeProblems.length}] Checking ${p.leetcodeSlug}... `);
      
      try {
        const isPremium = await getProblemPremiumStatus(p.leetcodeSlug);
        
        if (isPremium !== p.isPremium) {
          p.isPremium = isPremium;
          await p.save();
          console.log(isPremium ? '💎 PREMIUM' : '✅ FREE');
          updatedCount++;
          if (isPremium) premiumCount++;
        } else {
          console.log('No change.');
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.log(`Error: ${err.message}`);
      }
    }

    console.log('\n--- Sync Complete ---');
    console.log(`Checked: ${leetcodeProblems.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Total Premium: ${premiumCount}`);

    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
};

syncPremiumStatus();
