const express = require('express');
const passport = require('passport');
const { generateToken, setAuthCookie } = require('../config/passport');
const { authGuard } = require('../middleware/authGuard');

const router = express.Router();

// GET /api/auth/google — Initiate Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

// GET /api/auth/google/callback — Handle OAuth redirect
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/?error=auth_failed` }),
  (req, res) => {
    const token = generateToken(req.user._id);
    setAuthCookie(res, token);

    // Redirect based on onboarding status
    // Use hash fragment for secure token delivery to clients that block cookies (e.g., iOS/Brave)
    if (!req.user.onboardingComplete) {
      return res.redirect(`${process.env.CLIENT_URL}/onboarding#token=${token}`);
    }
    res.redirect(`${process.env.CLIENT_URL}/dashboard/today#token=${token}`);
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ success: true, message: 'Logged out successfully.' });
});

const Progress = require('../models/Progress');

// GET /api/auth/me — Return current user
router.get('/me', authGuard, async (req, res) => {
  try {
    // Pass a token since authGuard rotates it
    const currentToken = req.cookies?.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);

    // Calculate true total solved by deduping all completed problems
    const userProgress = await Progress.find({
      userId: req.user._id,
      'completed.0': { $exists: true }
    }).select('completed.problemId').lean();

    const uniqueCompleted = new Set();
    userProgress.forEach(doc => {
      doc.completed.forEach(c => uniqueCompleted.add(c.problemId.toString()));
    });
    
    const realTotalSolved = uniqueCompleted.size;

    // Auto-heal the user doc if it's out of sync
    if (req.user.totalSolved !== realTotalSolved) {
      req.user.totalSolved = realTotalSolved;
      await req.user.save();
    }

    res.json({
      success: true,
      token: res.getHeader('X-Auth-Token') || currentToken, // Explicitly include token in response body for iOS support
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        leetcodeUsername: req.user.leetcodeUsername,
        startDate: req.user.startDate,
        dailyGoal: req.user.dailyGoal,
        currentStreak: req.user.currentStreak,
        longestStreak: req.user.longestStreak,
        totalSolved: realTotalSolved,
        onboardingComplete: req.user.onboardingComplete,
        isAdmin: req.user.isAdmin || false,
      },
    });
  } catch (err) {
    console.error('Error fetching /me', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
