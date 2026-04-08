const express = require('express');
const { body } = require('express-validator');
const { completeOnboarding, validateLeetCodeUsername } = require('../controllers/onboardingController');

const router = express.Router();

router.post(
  '/complete',
  [
    body('leetcodeUsername').trim().notEmpty().isLength({ min: 2, max: 30 }),
    body('startDate').notEmpty().isISO8601().toDate(),
    body('dailyGoal').isIn(['light', 'medium', 'intense']),
  ],
  completeOnboarding
);

router.get('/validate-lc/:username', validateLeetCodeUsername);

module.exports = router;
