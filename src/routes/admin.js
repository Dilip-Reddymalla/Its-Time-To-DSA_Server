const express = require('express');
const router = express.Router();
const {
  getDashboardOverview,
  getAllUsers,
  getUserDetail,
  getTodaySnapshot,
  getPlatformStats,
  getLeaderboard,
  getUserActivityLog,
  toggleBanUser,
  adminMarkProblem,
  getReports,
  resolveReport,
  updateProblemAdmin,
  getUserFullSchedule,
  adminReplaceProblem,
  adminRemoveProblem,
} = require('../controllers/adminController');

// ─── Read-Only Endpoints ─────────────────────────────────────────────────────
router.get('/reports', getReports);
router.get('/overview', getDashboardOverview);
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetail);
router.get('/users/:id/schedule', getUserFullSchedule);
router.get('/users/:id/activity', getUserActivityLog);
router.get('/today', getTodaySnapshot);
router.get('/stats', getPlatformStats);
router.get('/leaderboard', getLeaderboard);

// ─── Write Endpoints ─────────────────────────────────────────────────────────
router.post('/users/:id/ban', toggleBanUser);
router.post('/mark-problem', adminMarkProblem);
router.post('/users/:id/replace-problem', adminReplaceProblem);
router.post('/users/:id/remove-problem', adminRemoveProblem);
router.put('/reports/:id/resolve', resolveReport);
router.put('/problems/:id', updateProblemAdmin);

module.exports = router;
