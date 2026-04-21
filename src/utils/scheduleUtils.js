/**
 * reconcileRevisionDays(days)
 *
 * After any date-shifting operation (Sunday rest insertion, pause/resume, etc.),
 * walk through the schedule days and ensure:
 *   - Days landing on Saturday (getUTCDay() === 6) have type 'revision'
 *   - Days NOT on Saturday that are incorrectly marked 'revision' get corrected to 'learn'
 *   - Rest days (Sundays) are never touched
 *
 * This is NON-DESTRUCTIVE — it only changes metadata labels (type, isRevision),
 * never the actual problem assignments.
 */
function reconcileRevisionDays(days) {
  for (const day of days) {
    // Never touch rest days
    if (day.type === 'rest') continue;

    const dayOfWeek = new Date(day.date).getUTCDay();

    if (dayOfWeek === 6 && day.type !== 'revision') {
      // This day now falls on Saturday but isn't labelled as revision
      day.type = 'revision';
      if (day.problems) {
        day.problems.forEach(p => { p.isRevision = true; });
      }
      if (day.readings) {
        day.readings = [{ title: "Weekly Wrap-up & Spaced Repetition", type: 'concept' }];
      }
    } else if (dayOfWeek !== 6 && day.type === 'revision') {
      // This day is labelled revision but no longer falls on Saturday
      day.type = 'learn';
      if (day.problems) {
        day.problems.forEach(p => { p.isRevision = false; });
      }
    }
  }

  return days;
}

module.exports = { reconcileRevisionDays };
