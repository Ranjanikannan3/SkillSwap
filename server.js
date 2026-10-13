const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const apiRouter = require('./src/routes/api');
const { seedDatabase } = require('./src/seed');
const { verifyToken } = require('./src/auth');

const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillswap';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Socket.IO authentication and room management
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      socket.user = decoded;
    }
  }
  next(); // Allow connection (guests can listen to public feed)
});

io.on('connection', (socket) => {
  // Join global community broadcast room
  socket.join('community');

  if (socket.user) {
    // Join private user room for targeted notifications/updates
    socket.join(`user:${socket.user.id}`);

    // Join moderation room if user is staff
    if (['admin', 'moderator'].includes(socket.user.systemRole)) {
      socket.join('moderation');
    }
  }

  socket.on('join:post', (postId) => {
    if (postId) socket.join(`post:${postId}`);
  });

  socket.on('leave:post', (postId) => {
    if (postId) socket.leave(`post:${postId}`);
  });

  socket.on('join:conversation', (convId) => {
    if (convId) socket.join(`conv:${convId}`);
  });

  socket.on('leave:conversation', (convId) => {
    if (convId) socket.leave(`conv:${convId}`);
  });

  socket.on('chat:typing', ({ conversationId, isTyping }) => {
    if (conversationId && socket.user) {
      socket.to(`conv:${conversationId}`).emit('chat:typing', {
        conversationId,
        userId: socket.user.id,
        userName: socket.user.name,
        isTyping: !!isTyping
      });
    }
  });
});

// Attach io to express app so routes can broadcast events
app.set('io', io);

// API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA client routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  next();
});

// MongoDB Connection & Server Launch
async function startServer() {
  try {
    console.log(`[Database] Connecting to MongoDB at ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('[Database] MongoDB Atlas / Local connection established successfully.');

    // Seed database if empty
    await seedDatabase();

    server.listen(PORT, () => {
      console.log(`[Server] SkillSwap live and running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Error] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };
