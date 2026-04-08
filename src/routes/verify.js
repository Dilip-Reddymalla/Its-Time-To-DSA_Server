const express = require('express');
const { verifyLimiter } = require('../middleware/rateLimiter');
const { verifySubmissions } = require('../controllers/verifyController');

const router = express.Router();

// POST /api/verify
router.post('/', verifyLimiter, verifySubmissions);

module.exports = router;
