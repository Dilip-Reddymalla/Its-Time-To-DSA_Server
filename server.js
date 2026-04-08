require('dotenv').config(); // Trigger nodemon restart to pick up PORT 3001
const mongoose = require('mongoose');
const app = require('./src/app');

const PORT = process.env.PORT || 3001;

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Retrying...');
  setTimeout(connectDB, 5000);
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    console.log(`   → API: http://localhost:${PORT}/api`);
    console.log(`   → Client: ${process.env.CLIENT_URL}`);
  });
};

startServer();
