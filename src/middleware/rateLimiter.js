const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiter for LeetCode verify endpoint (30 req/min)
 */
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verify requests. Please wait a minute.',
    code: 'RATE_LIMITED',
  },
});

/**
 * General API limiter (100 req/min)
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
    code: 'RATE_LIMITED',
  },
});

/**
 * Admin API limiter (500 req/min)
 */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many admin requests.',
    code: 'RATE_LIMITED',
  },
});

module.exports = { verifyLimiter, generalLimiter, adminLimiter };
