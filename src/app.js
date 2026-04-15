const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const passport = require('passport');

require('./config/passport');

const authRoutes = require('./routes/auth');
const onboardingRoutes = require('./routes/onboarding');
const scheduleRoutes = require('./routes/schedule');
const progressRoutes = require('./routes/progress');
const verifyRoutes = require('./routes/verify');
const statsRoutes = require('./routes/stats');
const userRoutes = require('./routes/user');
const problemRoutes = require('./routes/problem');
const adminRoutes = require('./routes/admin');

const { errorHandler } = require('./middleware/errorHandler');
const { authGuard } = require('./middleware/authGuard');
const { adminGuard } = require('./middleware/adminGuard');
const { generalLimiter, adminLimiter } = require('./middleware/rateLimiter');

const app = express();
app.set('trust proxy', 1);

// ─── Security & Parsing Middleware ────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'http://localhost:5173',
    /\.vercel\.app$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Public Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', generalLimiter, authRoutes);

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.use('/api/onboarding', generalLimiter, authGuard, onboardingRoutes);
app.use('/api/schedule', generalLimiter, authGuard, scheduleRoutes);
app.use('/api/progress', generalLimiter, authGuard, progressRoutes);
app.use('/api/verify', generalLimiter, authGuard, verifyRoutes);
app.use('/api/stats', generalLimiter, authGuard, statsRoutes);
app.use('/api/user', generalLimiter, authGuard, userRoutes);
app.use('/api/problems', generalLimiter, authGuard, problemRoutes);
app.use('/api/admin', adminLimiter, authGuard, adminGuard, adminRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
