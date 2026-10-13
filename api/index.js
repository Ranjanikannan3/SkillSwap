const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const apiRouter = require('../src/routes/api');
const { seedDatabase } = require('../src/seed');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cached MongoDB Connection for Vercel Serverless Functions
let isConnected = false;
async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is missing.');
  }

  console.log('[Vercel Serverless] Connecting to MongoDB Atlas...');
  await mongoose.connect(uri, {
    bufferCommands: false
  });
  isConnected = true;
  console.log('[Vercel Serverless] MongoDB connected successfully.');

  // Automatically seed initial data if running on a fresh cluster
  try {
    await seedDatabase();
  } catch (seedErr) {
    console.warn('[Vercel Serverless] Seed check skipped or failed:', seedErr.message);
  }
}

// Middleware to ensure database is connected before handling any API request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[Vercel Serverless] DB connection error:', err);
    res.status(500).json({
      error: 'Database connection failed',
      details: err.message
    });
  }
});

// Safe Socket.IO mock for serverless environment so API route events do not throw errors
const safeIO = {
  emit: () => safeIO,
  to: () => safeIO,
  in: () => safeIO,
  join: () => safeIO,
  leave: () => safeIO
};
app.set('io', safeIO);

// Mount main API routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: 'vercel-serverless',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

module.exports = app;
