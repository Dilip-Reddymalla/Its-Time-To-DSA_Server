/**
 * reconcileRevisionDays(days)
 *
 * PURELY DATE-DRIVEN reconciliation that fixes BOTH labels AND content.
 *
 * After any date-shifting operation (Sunday rest insertion, pause/resume, etc.),
 * this function:
 *   1. Corrects type labels based on the actual date (Saturday = revision, else = learn)
 *   2. SWAPS problem content between misaligned days:
 *      - Finds current Saturdays that are missing their boss-fight content
 *      - Finds non-Saturday days that have boss-fight content (displaced by shift)
 *      - Swaps their problem arrays so Hard/revision content lands on actual Saturdays
 *
 * Rules:
 *   - Rest days (type === 'rest') are NEVER touched.
 *   - Saturday (getUTCDay() === 6) → type = 'revision'
 *   - Any other weekday → type = 'learn'
 */
function reconcileRevisionDays(days) {
  // ── PASS 1: Fix type labels (purely date-driven) ──
  for (const day of days) {
    if (day.type === 'rest') continue;
    const dayOfWeek = new Date(day.date).getUTCDay();

    if (dayOfWeek === 6) {
      day.type = 'revision';
    } else {
      day.type = 'learn';
    }
  }

  // ── PASS 2: Identify content misalignment and swap ──
  // A "real Saturday" should have at least one Hard problem (boss fight).
  // After a Sunday shift, the boss-fight content is on the wrong day.

  // Collect current Saturdays that are MISSING hard content
  const emptySaturdays = [];
  // Collect non-Saturday days that HAVE hard content (displaced boss fights)
  const displacedBossDays = [];

  for (const day of days) {
    if (day.type === 'rest') continue;
    const dayOfWeek = new Date(day.date).getUTCDay();
    const hasHard = day.problems?.some(p => p.difficulty === 'Hard');

    if (dayOfWeek === 6 && !hasHard && day.problems?.length > 0) {
      emptySaturdays.push(day);
    } else if (dayOfWeek !== 6 && hasHard && day.type === 'learn') {
      displacedBossDays.push(day);
    }
  }

  // Match each empty Saturday with the nearest displaced boss-fight day and swap
  for (const sat of emptySaturdays) {
    const satDate = new Date(sat.date).getTime();

    // Find the closest displaced day (prefer days just before the Saturday)
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < displacedBossDays.length; i++) {
      const dDate = new Date(displacedBossDays[i].date).getTime();
      const dist = Math.abs(dDate - satDate);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) continue; // No displaced days left to swap

    const displaced = displacedBossDays[bestIdx];

    // SWAP problem arrays
    const satProblems = sat.problems;
    const satReadings = sat.readings;
    sat.problems = displaced.problems;
    sat.readings = [{ title: "Weekly Wrap-up & Spaced Repetition", type: 'concept' }];
    displaced.problems = satProblems;
    displaced.readings = satReadings;

    // Fix isRevision flags after swap
    if (sat.problems) {
      sat.problems.forEach(p => { p.isRevision = true; });
    }
    if (displaced.problems) {
      displaced.problems.forEach(p => { p.isRevision = false; });
    }

    // Remove the used displaced day from the pool
    displacedBossDays.splice(bestIdx, 1);
  }

  return days;
}

module.exports = { reconcileRevisionDays };
