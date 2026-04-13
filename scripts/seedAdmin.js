/**
 * Seed Admin Script
 * Usage: node scripts/seedAdmin.js
 * 
 * Sets isAdmin: true for the configured admin email.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const ADMIN_EMAIL = 'reddymaladilip@gmail.com';

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📡 Connected to MongoDB');

    const user = await User.findOneAndUpdate(
      { email: ADMIN_EMAIL },
      { isAdmin: true },
      { new: true }
    );

    if (user) {
      console.log(`✅ Admin privileges granted to: ${user.name} (${user.email})`);
    } else {
      console.log(`❌ No user found with email: ${ADMIN_EMAIL}`);
      console.log('   Make sure this user has logged in at least once via Google OAuth.');
    }

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
};

seedAdmin();
