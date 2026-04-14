
const mongoose = require('mongoose');
const path = require('path');
const Problem = require('../src/models/Problem');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const core = await Problem.find({
    isOptional: { $ne: true },
    isPremium: { $ne: true }
  }).lean();
  
  const lcMap = new Map();
  const duplicates = [];
  
  core.forEach(p => {
    if (p.leetcodeSlug && p.leetcodeSlug !== 'null') {
      if (lcMap.has(p.leetcodeSlug)) {
        duplicates.push({ type: 'LeetCode', slug: p.leetcodeSlug, p1: lcMap.get(p.leetcodeSlug), p2: p });
      } else {
        lcMap.set(p.leetcodeSlug, p);
      }
    }
  });
  
  console.log('Total Core Problems:', core.length);
  console.log('Link Duplicates Found:', duplicates.length);
  duplicates.forEach(d => {
    console.log(`- ${d.type} Duplicate: ${d.slug}`);
    console.log(`  P1: ${d.p1.name} (${d.p1._id})`);
    console.log(`  P2: ${d.p2.name} (${d.p2._id})`);
  });
  
  process.exit(0);
}

run();
