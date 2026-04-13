/**
 * Sync Striver A2Z Sheet — npm run sync:striver
 *
 * Reads scripts/striver_full.json, maps topics, fetches LeetCode
 * difficulty via GraphQL, and upserts every problem into MongoDB.
 *
 * Idempotent: uses upsert on `slug` field.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Problem = require('../src/models/Problem');

// ─── Topic Mapping ───────────────────────────────────────────────────────────
// Maps verbose Striver topic names → our consolidated DB topic names.
const TOPIC_MAP = {
  'Learn the basics':                                          'Foundation',
  'Learn Important Sorting Techniques':                        'Foundation',
  'Solve Problems on Arrays [Easy -> Medium -> Hard]':         'Arrays',
  'Binary Search [1D, 2D Arrays, Search Space]':               'Binary Search',
  'Strings [Basic and Medium]':                                'Strings',
  'Learn LinkedList [Single LL, Double LL, Medium, Hard Problems]': 'Linked Lists',
  'Recursion [PatternWise]':                                   'Recursion',
  'Bit Manipulation [Concepts & Problems]':                    'Bit Manipulation',
  'Stack and Queues [Learning, Pre-In-Post-fix, Monotonic Stack, Implementation]': 'Stacks & Queues',
  'Sliding Window & Two Pointer Combined Problems':            'Sliding Window',
};

const mapTopic = (rawTopic) => {
  if (TOPIC_MAP[rawTopic]) return TOPIC_MAP[rawTopic];
  // Fuzzy fallback — try to find a partial key match
  for (const key of Object.keys(TOPIC_MAP)) {
    if (rawTopic.toLowerCase().includes(key.toLowerCase().slice(0, 12))) {
      return TOPIC_MAP[key];
    }
  }
  return rawTopic; // keep raw if no mapping found
};

// The JSON now contains accurate 'difficulty' values.
// ─── LeetCode Difficulty Fetcher (Removed) ───────────────────────────────────

// Small delay helper to avoid LeetCode rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Extract slug from LeetCode URL ─────────────────────────────────────────
const extractSlug = (url) => {
  if (!url || !url.includes('leetcode.com/problems/')) return null;
  // https://leetcode.com/problems/two-sum  →  two-sum
  const parts = url.split('/problems/')[1];
  if (!parts) return null;
  return parts.split('/')[0].split('?')[0].toLowerCase();
};

// ─── Main Sync Function ─────────────────────────────────────────────────────
const syncStriver = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const jsonPath = path.join(__dirname, 'striver_full.json');
    if (!fs.existsSync(jsonPath)) {
      console.error('❌ striver_full.json not found in scripts/');
      process.exit(1);
    }

    const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`📄 Loaded ${rawData.length} problems from striver_full.json`);

    let created = 0;
    let updated = 0;
    let lcFetched = 0;
    let lcFailed = 0;

    for (let i = 0; i < rawData.length; i++) {
      const entry = rawData[i];
      const leetcodeSlug = extractSlug(entry.link);

      if (!leetcodeSlug) {
        console.log(`  ⏭️  Skipping "${entry.question}" — no valid LeetCode slug`);
        continue;
      }

      const mappedTopic = mapTopic(entry.topic);
      const dbSlug = leetcodeSlug; // We use the LeetCode slug as our DB slug

      // Check if problem already exists in DB
      const existing = await Problem.findOne({ slug: dbSlug }).lean();

      // Use difficulty directly from JSON
      let officialDifficulty = entry.difficulty || existing?.difficulty || 'Medium';

      const updatePayload = {
        name: existing?.name || entry.question,
        slug: dbSlug,
        difficulty: officialDifficulty,
        topic: existing?.topic && existing.topic !== 'Foundation' ? existing.topic : mappedTopic,
        leetcodeSlug: leetcodeSlug,
        striverTopic: entry.topic, // preserve raw Striver topic
        source: existing?.source || 'striver-a2z',
        $unset: { striverDifficulty: 1 } // Remove the field if it exists
      };

      // YouTube link — prefer existing, but fill in from Striver if missing
      if (entry.youtube && entry.youtube.trim()) {
        updatePayload.youtubeUrl = entry.youtube.trim();
        // Also set as resourceUrl if none exists
        if (!existing?.resourceUrl) {
          updatePayload.resourceUrl = entry.youtube.trim();
        }
      }

      const result = await Problem.findOneAndUpdate(
        { slug: dbSlug },
        { 
          $set: { ...updatePayload, $unset: undefined },
          $unset: { striverDifficulty: 1 }
        },
        { upsert: true, new: true }
      );

      if (existing) {
        updated++;
      } else {
        created++;
      }

      const statusIcon = existing ? '♻️ ' : '🆕';
      // Print progress every 10 problems
      if ((i + 1) % 10 === 0 || i === rawData.length - 1) {
        console.log(`  ${statusIcon} [${i + 1}/${rawData.length}] ${entry.question} → ${mappedTopic} (${officialDifficulty})`);
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Striver A2Z Sync Complete!');
    console.log(`   🆕 Created:  ${created}`);
    console.log(`   ♻️  Updated:  ${updated}`);
    console.log('═'.repeat(50));

    // Show total problem count in DB
    const totalProblems = await Problem.countDocuments();
    const striverProblems = await Problem.countDocuments({ source: 'striver-a2z' });
    console.log(`\n📊 DB Summary: ${totalProblems} total problems, ${striverProblems} from Striver sheet`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Sync failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

syncStriver();
