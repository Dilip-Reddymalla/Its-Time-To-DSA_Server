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

// GET /api/auth/me — Return current user
router.get('/me', authGuard, (req, res) => {
  // Pass a token since authGuard rotates it
  const currentToken = req.cookies?.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);

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
      totalSolved: req.user.totalSolved,
      onboardingComplete: req.user.onboardingComplete,
    },
  });
});

module.exports = router;
