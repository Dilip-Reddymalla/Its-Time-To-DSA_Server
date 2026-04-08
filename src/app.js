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

const { errorHandler } = require('./middleware/errorHandler');
const { authGuard } = require('./middleware/authGuard');

const app = express();

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
app.use('/api/auth', authRoutes);

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.use('/api/onboarding', authGuard, onboardingRoutes);
app.use('/api/schedule', authGuard, scheduleRoutes);
app.use('/api/progress', authGuard, progressRoutes);
app.use('/api/verify', authGuard, verifyRoutes);
app.use('/api/stats', authGuard, statsRoutes);
app.use('/api/user', authGuard, userRoutes);
app.use('/api/problems', authGuard, problemRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
