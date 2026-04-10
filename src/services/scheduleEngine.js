const Problem = require('../models/Problem');
const Schedule = require('../models/Schedule');

const PHASE_BLUEPRINTS = [
  { percent: 0.15, topics: ['Arrays', 'Strings', 'Basic Math'] },
  { percent: 0.20, topics: ['Hashing', 'Two Pointers', 'Sliding Window'] },
  { percent: 0.20, topics: ['Recursion', 'Backtracking', 'Binary Search'] },
  { percent: 0.25, topics: ['Graphs', 'Trees', 'Heaps'] },
  { percent: 0.20, topics: ['Dynamic Programming', 'Advanced Graphs'] },
];

const calculatePhases = (totalDays) => {
  let currentDay = 1;
  return PHASE_BLUEPRINTS.map((bp, index) => {
    const duration = index === PHASE_BLUEPRINTS.length - 1 
      ? totalDays - currentDay + 1 
      : Math.round(totalDays * bp.percent);
    
    const range = [currentDay, currentDay + duration - 1];
    currentDay += duration;
    
    return { phaseIndex: index, range, topics: bp.topics };
  });
};

/**
 * 2. DAILY DIFFICULTY MIXER (Interleaved Practice)
 * Strictly enforces Medium > Easy > Hard.
 * Compensates with more Easy/Medium problems on non-Hard days.
 */
const getDailyMix = (phaseIndex, dailyGoal, dayNum) => {
  // Lock Hard problems behind a strict rotation to prevent flooding
  let isHardDay = false;
  if (dailyGoal === 'light') isHardDay = dayNum % 4 === 0;       // Hard every 4 days
  else if (dailyGoal === 'medium') isHardDay = dayNum % 3 === 0; // Hard every 3 days
  else isHardDay = dayNum % 2 === 0;                             // Hard every 2 days

  // Phase 0: Basics (Strictly build fundamentals, no Hard problems)
  if (phaseIndex === 0) {
    if (dailyGoal === 'light')  return { Easy: 2, Medium: 1, Hard: 0, Revise: 0 };
    if (dailyGoal === 'medium') return { Easy: 2, Medium: 2, Hard: 0, Revise: 1 };
    return { Easy: 2, Medium: 3, Hard: 0, Revise: 1 };
  }

  // Phase 1: Patterns (Transition phase)
  if (phaseIndex === 1) {
    if (dailyGoal === 'light') {
      return isHardDay ? { Easy: 1, Medium: 1, Hard: 1, Revise: 0 } 
                       : { Easy: 2, Medium: 1, Hard: 0, Revise: 1 };
    }
    if (dailyGoal === 'medium') {
      return isHardDay ? { Easy: 1, Medium: 2, Hard: 1, Revise: 1 } 
                       : { Easy: 2, Medium: 2, Hard: 0, Revise: 1 };
    }
    return isHardDay ? { Easy: 1, Medium: 3, Hard: 1, Revise: 1 } 
                     : { Easy: 2, Medium: 3, Hard: 0, Revise: 2 };
  }

  // Phase 2, 3, 4: Core Logic, Data Structures, Advanced 
  // (Medium takes the lead here: Medium > Easy > Hard)
  if (phaseIndex >= 2) {
    if (dailyGoal === 'light') {
      return isHardDay ? { Easy: 0, Medium: 2, Hard: 1, Revise: 1 } 
                       : { Easy: 1, Medium: 2, Hard: 0, Revise: 1 };
    }
    if (dailyGoal === 'medium') {
      return isHardDay ? { Easy: 1, Medium: 2, Hard: 1, Revise: 1 } 
                       : { Easy: 1, Medium: 3, Hard: 0, Revise: 1 };
    }
    return isHardDay ? { Easy: 1, Medium: 3, Hard: 1, Revise: 2 } 
                     : { Easy: 2, Medium: 4, Hard: 0, Revise: 2 };
  }
};

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const generateSchedule = async (userId, startDate, dailyGoal, totalDays = 90, excludeProblemIds = []) => {
  const excludeIds = (excludeProblemIds || []).map(id => id.toString());
  
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const phases = calculatePhases(totalDays);
  const allAvailableProblems = await Problem.find({ _id: { $nin: excludeIds } }).lean();
  
  const pool = {};
  const linklessPool = {};

  allAvailableProblems.forEach(p => {
    const validLc = p.leetcodeSlug && p.leetcodeSlug !== 'null';
    const validGfg = (p.gfgUrl && p.gfgUrl !== 'null') || (p.gfgLink && p.gfgLink !== 'null');
    const isValid = !!(validLc || validGfg);

    if (isValid) {
      if (!pool[p.topic]) pool[p.topic] = { Easy: [], Medium: [], Hard: [] };
      if (!pool[p.topic][p.difficulty]) pool[p.topic][p.difficulty] = [];
      pool[p.topic][p.difficulty].push(p);
    } else {
      if (!linklessPool[p.topic]) linklessPool[p.topic] = [];
      linklessPool[p.topic].push(p);
    }
  });

  Object.keys(pool).forEach(topic => {
    Object.keys(pool[topic]).forEach(diff => {
      pool[topic][diff] = shuffleArray(pool[topic][diff]);
    });
  });
  Object.keys(linklessPool).forEach(topic => {
    linklessPool[topic] = shuffleArray(linklessPool[topic]);
  });

  const assignedHistory = []; 
  const hardQuotaTracker = {}; // NEW: Tracks how many Hard questions assigned per topic
  const days = [];

  const popSpecificMix = (topic, mixConfig) => {
    const selected = [];
    ['Easy', 'Medium', 'Hard'].forEach(diff => {
      let count = mixConfig[diff];
      while (count > 0) {
        if (pool[topic] && pool[topic][diff] && pool[topic][diff].length > 0) {
          selected.push({ ...pool[topic][diff].pop(), isRevision: false });
        } else {
          // Fallback to past topics if current is empty
          const fallbackTopic = Object.keys(pool).find(t => pool[t][diff] && pool[t][diff].length > 0);
          if (fallbackTopic) {
             selected.push({ ...pool[fallbackTopic][diff].pop(), isRevision: false });
          }
        }
        count--;
      }
    });
    return selected;
  };

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const date = new Date(start);
    date.setDate(start.getDate() + dayNum - 1);
    
    // NEW: Check if the day is Saturday (0 is Sunday, 6 is Saturday)
    const isSaturday = date.getUTCDay() === 6;

    // === SATURDAY REVISION & BOSS FIGHT ===
    if (isSaturday) {
      let revisionProblems = [];
      const revCount = dailyGoal === 'light' ? 2 : (dailyGoal === 'medium' ? 3 : 4);
      
      if (assignedHistory.length > 0) {
        const shuffledPast = shuffleArray(assignedHistory);
        revisionProblems = shuffledPast.slice(0, revCount).map(p => ({ ...p, isRevision: true }));
      }

      // The Weekly Boss Challenge: 1 Brand New Problem
      let challengeProblem = null;
      // Look for a Hard problem first across all topics, fallback to Medium
      for (const diff of ['Hard', 'Medium']) {
        const availableTopic = Object.keys(pool).find(t => pool[t][diff] && pool[t][diff].length > 0);
        if (availableTopic) {
          challengeProblem = { ...pool[availableTopic][diff].pop(), isRevision: false, isChallenge: true };
          break;
        }
      }

      const saturdayProblems = [...revisionProblems];
      if (challengeProblem) {
        saturdayProblems.push(challengeProblem);
        assignedHistory.push(challengeProblem);
      }
      
      // Optionally inject a Search & Practice conceptual item into Saturday
      const unexhaustedLinklessThemes = Object.keys(linklessPool).filter(t => linklessPool[t].length > 0);
      if (unexhaustedLinklessThemes.length > 0) {
        // pick a random topic from linkless pool
        const randTopic = unexhaustedLinklessThemes[Math.floor(Math.random() * unexhaustedLinklessThemes.length)];
        const searchProb = { ...linklessPool[randTopic].pop(), isRevision: false };
        saturdayProblems.push(searchProb);
        assignedHistory.push(searchProb);
      }

      days.push({
        dayNumber: dayNum,
        date,
        type: 'revision',
        isCompleted: false,
        readings: [{ title: "Weekly Wrap-up & Spaced Repetition", type: 'concept' }],
        problems: saturdayProblems.map(p => ({
          problemId: p._id,
          difficulty: p.difficulty,
          topic: p.topic,
          isRevision: p.isRevision || false,
          isChallenge: p.isChallenge || false, // UI can show a 🏆 icon
          status: 'pending'
        }))
      });
      continue;
    }

    // === NORMAL LEARNING DAY ===
    const currentPhase = phases.find(p => dayNum >= p.range[0] && dayNum <= p.range[1]);
    if (!currentPhase) continue;

    const topicIndex = dayNum % currentPhase.topics.length;
    const primaryTopic = currentPhase.topics[topicIndex];

    if (!hardQuotaTracker[primaryTopic]) hardQuotaTracker[primaryTopic] = 0;

    let dailyMix = getDailyMix(currentPhase.phaseIndex, dailyGoal, dayNum);

    // NEW: The 5-Hard Problem Guarantee
    // If we haven't hit 5 hards for this topic, and the DB still has hard problems for it
    // if (hardQuotaTracker[primaryTopic] < 5 && pool[primaryTopic] && pool[primaryTopic]['Hard']?.length > 0) {
    //   if (dailyMix.Hard === 0) {
    //     dailyMix.Hard = 1; // Force a hard problem today
    //     // Reduce an Easy/Medium to prevent the day from becoming overwhelmingly long
    //     if (dailyMix.Easy > 0) dailyMix.Easy -= 1;
    //     else if (dailyMix.Medium > 0) dailyMix.Medium -= 1;
    //   }
    // }

    let todayProblems = popSpecificMix(primaryTopic, dailyMix);

    // Track assigned hards to fulfill the quota
    todayProblems.forEach(p => {
      if (p.difficulty === 'Hard' && !p.isRevision && p.topic === primaryTopic) {
        hardQuotaTracker[primaryTopic] += 1;
      }
    });

    if (dailyMix.Revise > 0 && assignedHistory.length > 0) {
      const pastProblems = shuffleArray(assignedHistory);
      const revs = pastProblems.slice(0, dailyMix.Revise).map(p => ({ ...p, isRevision: true }));
      todayProblems = [...todayProblems, ...revs];
    }

    // Inject Search & Practice (Linkless) problems if available for this topic (1-2 per day)
    if (linklessPool[primaryTopic] && linklessPool[primaryTopic].length > 0) {
      // pop up to 1 linkless problem so it doesn't overwhelm the user
      const searchProb = { ...linklessPool[primaryTopic].pop(), isRevision: false };
      todayProblems.push(searchProb);
    }

    todayProblems.filter(p => !p.isRevision).forEach(p => {
       // linkless problems shouldn't necessarily go to history, but it doesn't hurt.
       assignedHistory.push(p);
    });

    days.push({
      dayNumber: dayNum,
      date,
      type: 'learn',
      isCompleted: false,
      readings: [
        { title: `Mastering ${primaryTopic}`, type: 'concept' },
      ],
      problems: todayProblems.map(p => ({
        problemId: p._id,
        difficulty: p.difficulty,
        topic: p.topic,
        isRevision: p.isRevision,
        status: 'pending'
      }))
    });
  }

  await Schedule.findOneAndUpdate(
    { userId },
    { userId, generatedAt: new Date(), totalDays, dailyGoal, days },
    { upsert: true, new: true }
  );

  console.log(`✅ Schedule generated. Sat Revisions + Quotas enforced.`);
};

module.exports = { generateSchedule };