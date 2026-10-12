const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {
  User,
  LearningSession,
  Post,
  Comment,
  Reaction,
  Bookmark,
  Review,
  Endorsement,
  SkillVerification,
  Report,
  Block,
  Conversation,
  Message,
  Notification,
  Goal,
  Activity
} = require('../models');
const {
  hashPassword,
  comparePassword,
  generateToken,
  requireAuth,
  optionalAuth,
  requireRole
} = require('../auth');
const { calculateUserTrustMetrics } = require('../trustScore');

// Sanitize user-generated text to prevent arbitrary executable script injection
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();
}

// Validate URL format
function isValidUrl(urlString) {
  if (!urlString) return true; // optional
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

// Helper to get socket.io instance attached to app
function getIO(req) {
  return req.app.get('io');
}

// Normalize skill string for case/whitespace-insensitive matching
function normalizeSkill(str) {
  return (str || '').toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
}

// Phase 3: Explainable Smart Skill Matching Algorithm
function computeSkillMatch(currentUser, candidateUser) {
  const reasons = [];
  const teachMatches = [];
  const learnMatches = [];

  const myOffered = (currentUser.skillsOffered || []).map(s => ({
    name: s.name,
    norm: normalizeSkill(s.name),
    category: s.category || 'General',
    level: s.level || 'Intermediate'
  }));

  const myWanted = (currentUser.skillsWanted || []).map(s => ({
    name: s.name,
    norm: normalizeSkill(s.name),
    category: s.category || 'General',
    level: s.level || 'Beginner'
  }));

  const theirOffered = (candidateUser.skillsOffered || []).map(s => ({
    name: s.name,
    norm: normalizeSkill(s.name),
    category: s.category || 'General',
    level: s.level || 'Intermediate'
  }));

  const theirWanted = (candidateUser.skillsWanted || []).map(s => ({
    name: s.name,
    norm: normalizeSkill(s.name),
    category: s.category || 'General',
    level: s.level || 'Beginner'
  }));

  for (const o of myOffered) {
    if (!o.norm) continue;
    const match = theirWanted.find(w => w.norm && (w.norm === o.norm || o.norm.includes(w.norm) || w.norm.includes(o.norm)));
    if (match) {
      teachMatches.push({ skill: o.name, candidateNeeds: match.name });
    }
  }

  for (const to of theirOffered) {
    if (!to.norm) continue;
    const match = myWanted.find(w => w.norm && (w.norm === to.norm || to.norm.includes(w.norm) || w.norm.includes(to.norm)));
    if (match) {
      learnMatches.push({ skill: to.name, userNeeds: match.name });
    }
  }

  let score = 0;
  if (teachMatches.length > 0 && learnMatches.length > 0) {
    score += 55;
    reasons.push(`Mutual Exchange: You teach ${teachMatches.map(m => m.skill).join(', ')} & learn ${learnMatches.map(m => m.skill).join(', ')}`);
  } else if (teachMatches.length > 0) {
    score += 35;
    reasons.push(`Mentorship Opportunity: You can teach ${teachMatches.map(m => m.skill).join(', ')}`);
  } else if (learnMatches.length > 0) {
    score += 35;
    reasons.push(`Learning Opportunity: ${candidateUser.name} can teach ${learnMatches.map(m => m.skill).join(', ')}`);
  }

  // Check Availability
  const myAvail = (currentUser.availability || []).map(a => a.toLowerCase().trim());
  const theirAvail = (candidateUser.availability || []).map(a => a.toLowerCase().trim());
  const sharedAvail = myAvail.filter(a => theirAvail.includes(a));
  if (sharedAvail.length > 0) {
    score += 20;
    reasons.push(`Compatible availability: ${sharedAvail.join(', ')}`);
  }

  // Check Shared Interests
  const myInterests = (currentUser.interests || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const theirInterests = (candidateUser.interests || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const sharedInterests = myInterests.filter(i => theirInterests.some(ti => ti.includes(i) || i.includes(ti)));
  if (sharedInterests.length > 0) {
    score += 15;
    reasons.push(`Shared interests: ${sharedInterests.slice(0, 3).join(', ')}`);
  }

  if (score === 0) {
    score = 15;
    reasons.push(`Community Peer: Connect to discover mutual learning goals`);
  }

  return {
    score: Math.min(100, score),
    reasons,
    teachMatches,
    learnMatches,
    isMutual: teachMatches.length > 0 && learnMatches.length > 0
  };
}

function parseSkillsArray(input, defaultLevel = 'Intermediate') {
  if (!Array.isArray(input)) return [];
  return input
    .map(s => {
      if (typeof s === 'string' && s.trim()) {
        return {
          name: sanitizeText(s.trim()),
          category: 'General',
          level: defaultLevel,
          description: '',
          format: '1-on-1 Session'
        };
      }
      if (s && typeof s === 'object' && (s.name || s.skill) && String(s.name || s.skill).trim()) {
        const skillName = String(s.name || s.skill).trim();
        return {
          name: sanitizeText(skillName),
          category: sanitizeText(s.category || 'General'),
          level: ['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(s.level) ? s.level : defaultLevel,
          description: sanitizeText(s.description || ''),
          format: sanitizeText(s.format || '1-on-1 Session')
        };
      }
      return null;
    })
    .filter(Boolean);
}

function parseStringList(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(item => sanitizeText(String(item).trim())).filter(Boolean);
  }
  if (typeof input === 'string') {
    return [sanitizeText(input.trim())].filter(Boolean);
  }
  return [];
}

/* =====================================================================
   1. AUTHENTICATION & USER ENDPOINTS
   ===================================================================== */

// POST /api/auth/register (Phase 1: Registration with Onboarding profile data)
router.post('/auth/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      institution,
      education,
      location,
      bio,
      interests,
      skillsOffered,
      skillsWanted,
      preferredMethods,
      availability
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ success: false, error: 'An account with that email already exists.' });
    }

    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      name: sanitizeText(name),
      email: cleanEmail,
      password: hashedPassword,
      role: role || 'Student',
      institution: sanitizeText(institution || ''),
      education: sanitizeText(education || ''),
      location: sanitizeText(location || ''),
      bio: sanitizeText(bio || ''),
      interests: Array.isArray(interests) ? interests.join(', ') : sanitizeText(interests || ''),
      skillsOffered: parseSkillsArray(skillsOffered, 'Intermediate'),
      skillsWanted: parseSkillsArray(skillsWanted, 'Beginner'),
      preferredMethods: parseStringList(preferredMethods),
      availability: parseStringList(availability),
      systemRole: 'member'
    });

    const token = generateToken(user);
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        education: user.education,
        bio: user.bio,
        interests: user.interests,
        skillsOffered: user.skillsOffered,
        skillsWanted: user.skillsWanted,
        availability: user.availability,
        preferredMethods: user.preferredMethods
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Failed to create user account.' });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        bio: user.bio,
        interests: user.interests
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed due to a server error.' });
  }
});

// POST /api/auth/switch-demo
router.post('/auth/switch-demo', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        bio: user.bio,
        interests: user.interests
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Demo switch failed.' });
  }
});

// POST /api/auth/forgot-password (Phase 1: Password Recovery)
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({
        success: true,
        message: 'If that email exists in our system, recovery instructions have been initiated.'
      });
    }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(24).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    res.json({
      success: true,
      message: 'Password recovery token generated. Use this token to set a new password.',
      resetToken
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Failed to process password recovery request.' });
  }
});

// POST /api/auth/reset-password (Phase 1: Password Recovery)
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, error: 'Reset token and new password are required.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters.' });
    }

    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset token.' });
    }

    user.password = await hashPassword(newPassword);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: 'Password has been successfully updated. You may now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

// PUT /api/auth/profile (Phase 1: Profile Update)
router.put('/auth/profile', requireAuth, async (req, res) => {
  try {
    const {
      name,
      role,
      institution,
      education,
      location,
      bio,
      interests,
      skillsOffered,
      skillsWanted,
      preferredMethods,
      availability
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (name) user.name = sanitizeText(name);
    if (role) user.role = sanitizeText(role);
    if (institution !== undefined) user.institution = sanitizeText(institution);
    if (education !== undefined) user.education = sanitizeText(education);
    if (location !== undefined) user.location = sanitizeText(location);
    if (bio !== undefined) user.bio = sanitizeText(bio);
    if (interests !== undefined) user.interests = sanitizeText(interests);

    if (skillsOffered !== undefined) {
      user.skillsOffered = parseSkillsArray(skillsOffered, 'Intermediate');
    }

    if (skillsWanted !== undefined) {
      user.skillsWanted = parseSkillsArray(skillsWanted, 'Beginner');
    }

    if (preferredMethods !== undefined) {
      user.preferredMethods = parseStringList(preferredMethods);
    }

    if (availability !== undefined) {
      user.availability = parseStringList(availability);
    }

    user.updatedAt = new Date();
    await user.save();

    const trust = await calculateUserTrustMetrics(user._id);
    res.json({
      success: true,
      message: 'Profile updated successfully in MongoDB.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        education: user.education,
        location: user.location,
        bio: user.bio,
        interests: user.interests,
        skillsOffered: user.skillsOffered,
        skillsWanted: user.skillsWanted,
        preferredMethods: user.preferredMethods,
        availability: user.availability,
        createdAt: user.createdAt,
        trustScore: trust.trustScore,
        trustTier: trust.trustTier,
        tierBadge: trust.tierBadge
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    const trust = await calculateUserTrustMetrics(user._id);
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        education: user.education,
        location: user.location,
        bio: user.bio,
        interests: user.interests,
        skillsOffered: user.skillsOffered || [],
        skillsWanted: user.skillsWanted || [],
        preferredMethods: user.preferredMethods || [],
        availability: user.availability || [],
        createdAt: user.createdAt,
        trustScore: trust.trustScore,
        trustTier: trust.trustTier,
        tierBadge: trust.tierBadge
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch current user profile.' });
  }
});

// GET /api/auth/users (Directory of users for switcher, mentions, profile lookup)
router.get('/auth/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ name: 1 });
    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        systemRole: u.systemRole,
        institution: u.institution,
        location: u.location,
        bio: u.bio,
        interests: u.interests,
        skillsOffered: u.skillsOffered || [],
        skillsWanted: u.skillsWanted || [],
        availability: u.availability || []
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch users list.' });
  }
});

// GET /api/users/:id (Public profile with full trust metrics)
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    const trustMetrics = await calculateUserTrustMetrics(user._id);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        systemRole: user.systemRole,
        institution: user.institution,
        education: user.education,
        location: user.location,
        bio: user.bio,
        interests: user.interests,
        skillsOffered: user.skillsOffered || [],
        skillsWanted: user.skillsWanted || [],
        preferredMethods: user.preferredMethods || [],
        availability: user.availability || [],
        createdAt: user.createdAt
      },
      trust: trustMetrics
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load user profile.' });
  }
});

// GET /api/dashboard/summary (Phase 2: Personalized Dashboard)
router.get('/dashboard/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('-password');
    const trust = await calculateUserTrustMetrics(userId);

    // Upcoming sessions (accepted or pending)
    const upcomingSessions = await LearningSession.find({
      $or: [{ mentorId: userId }, { learnerId: userId }],
      status: { $in: ['accepted', 'pending'] }
    })
      .sort({ date: 1 })
      .limit(5)
      .populate('mentorId', 'name email role institution')
      .populate('learnerId', 'name email role institution')
      .lean();

    // Completed sessions count & hours
    const completedSessions = await LearningSession.find({
      $or: [{ mentorId: userId }, { learnerId: userId }],
      status: 'completed'
    }).lean();

    const totalMinutes = completedSessions.reduce((acc, s) => acc + (s.minutes || 60), 0);

    // Unread counts
    const unreadMessagesCount = await Message.countDocuments({
      recipientId: userId,
      isRead: false
    });

    const unreadNotificationsCount = await Notification.countDocuments({
      userId,
      isRead: false
    });

    // Learning Goals
    const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).limit(5).lean();

    // Recent Activities
    const recentActivities = await Activity.find({ userId }).sort({ date: -1 }).limit(5).lean();

    // Blocked IDs
    const blocks = await Block.find({
      $or: [{ blockerId: userId }, { blockedId: userId }]
    }).lean();
    const blockedUserIds = new Set(
      blocks.map(b => b.blockerId.toString() === userId.toString() ? b.blockedId.toString() : b.blockerId.toString())
    );

    // Candidate users for matching
    const candidates = await User.find({ _id: { $ne: userId } }).select('-password').lean();

    const matches = [];
    for (const cand of candidates) {
      if (blockedUserIds.has(cand._id.toString())) continue;
      const matchResult = computeSkillMatch(user, cand);
      if (matchResult.score > 0) {
        matches.push({
          candidate: {
            id: cand._id,
            name: cand.name,
            email: cand.email,
            role: cand.role,
            institution: cand.institution,
            bio: cand.bio,
            skillsOffered: cand.skillsOffered || [],
            skillsWanted: cand.skillsWanted || [],
            availability: cand.availability || []
          },
          score: matchResult.score,
          reasons: matchResult.reasons,
          teachMatches: matchResult.teachMatches,
          learnMatches: matchResult.learnMatches,
          isMutual: matchResult.isMutual
        });
      }
    }
    matches.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      dashboard: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          systemRole: user.systemRole,
          institution: user.institution,
          skillsOffered: user.skillsOffered || [],
          skillsWanted: user.skillsWanted || [],
          availability: user.availability || []
        },
        skillsCanTeach: user.skillsOffered || [],
        skillsWantToLearn: user.skillsWanted || [],
        recommendedPartners: matches.slice(0, 4),
        upcomingSessions: upcomingSessions.map(s => {
          const isMentor = s.mentorId._id.toString() === userId.toString();
          const partner = isMentor ? s.learnerId : s.mentorId;
          return {
            id: s._id,
            skill: s.skill,
            category: s.category,
            date: s.date,
            time: s.time,
            minutes: s.minutes,
            status: s.status,
            myRole: isMentor ? 'Mentor' : 'Learner',
            partner: {
              id: partner._id,
              name: partner.name,
              email: partner.email,
              role: partner.role,
              institution: partner.institution
            }
          };
        }),
        unreadCounts: {
          messages: unreadMessagesCount,
          notifications: unreadNotificationsCount,
          total: unreadMessagesCount + unreadNotificationsCount
        },
        learningGoals: goals,
        trustStats: {
          score: trust.trustScore,
          tier: trust.trustTier,
          badge: trust.tierBadge,
          completedSessions: completedSessions.length,
          totalHours: (totalMinutes / 60).toFixed(1),
          reviewsCount: trust.breakdown?.reviewsReceived?.count || 0,
          endorsementsCount: trust.breakdown?.endorsementsReceived?.count || 0,
          verificationsCount: trust.breakdown?.verifiedSkills?.count || 0
        },
        recentActivities
      }
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate personalized dashboard summary.' });
  }
});

// GET /api/matches (Phase 3: Smart Skill Matching)
router.get('/matches', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const currentUser = await User.findById(userId).select('-password');
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const blocks = await Block.find({
      $or: [{ blockerId: userId }, { blockedId: userId }]
    }).lean();
    const blockedUserIds = new Set(
      blocks.map(b => b.blockerId.toString() === userId.toString() ? b.blockedId.toString() : b.blockerId.toString())
    );

    const candidates = await User.find({ _id: { $ne: userId } }).select('-password').lean();
    const results = [];

    for (const cand of candidates) {
      if (blockedUserIds.has(cand._id.toString())) continue;
      const match = computeSkillMatch(currentUser, cand);
      const trust = await calculateUserTrustMetrics(cand._id);

      results.push({
        candidate: {
          id: cand._id,
          name: cand.name,
          email: cand.email,
          role: cand.role,
          systemRole: cand.systemRole,
          institution: cand.institution,
          location: cand.location,
          bio: cand.bio,
          skillsOffered: cand.skillsOffered || [],
          skillsWanted: cand.skillsWanted || [],
          availability: cand.availability || [],
          interests: cand.interests || '',
          trustScore: trust.trustScore,
          trustTier: trust.trustTier
        },
        score: match.score,
        reasons: match.reasons,
        teachMatches: match.teachMatches,
        learnMatches: match.learnMatches,
        isMutual: match.isMutual
      });
    }

    results.sort((a, b) => b.score - a.score);
    res.json({ success: true, count: results.length, matches: results });
  } catch (err) {
    console.error('Matches error:', err);
    res.status(500).json({ success: false, error: 'Failed to calculate skill matches.' });
  }
});

/* =====================================================================
   2. COMMUNITY KNOWLEDGE HUB (POSTS, COMMENTS, REACTIONS, BOOKMARKS)
   ===================================================================== */

// GET /api/posts
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tag,
      type,
      search,
      author,
      sort = 'newest'
    } = req.query;

    const query = {};

    // Tag filter
    if (tag && tag.trim()) {
      query.tags = tag.trim().toLowerCase();
    }

    // Content type filter
    if (type && type.trim()) {
      query.contentType = type.trim();
    }

    // Author filter
    if (author && author.trim()) {
      query.authorId = author.trim();
    }

    // Keyword search
    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
        { tags: { $regex: term, $options: 'i' } }
      ];
    }

    // Filter out blocked authors if user is authenticated
    if (req.user) {
      const blocks = await Block.find({
        $or: [{ blockerId: req.user._id }, { blockedId: req.user._id }]
      });
      const blockedIds = blocks.map(b =>
        b.blockerId.toString() === req.user._id.toString() ? b.blockedId : b.blockerId
      );
      if (blockedIds.length > 0) {
        query.authorId = { ...(query.authorId ? { $eq: query.authorId } : {}), $nin: blockedIds };
      }
    }

    // Sorting
    let sortObj = { createdAt: -1 };
    if (sort === 'most_helpful') {
      sortObj = { 'reactionsCount.helpful': -1, createdAt: -1 };
    } else if (sort === 'most_discussed') {
      sortObj = { commentsCount: -1, createdAt: -1 };
    } else if (sort === 'most_liked') {
      sortObj = { 'reactionsCount.like': -1, createdAt: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [total, posts] = await Promise.all([
      Post.countDocuments(query),
      Post.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .populate('authorId', 'name email role systemRole institution')
        .lean()
    ]);

    // Attach current user's reaction & bookmark state if logged in
    let userReactions = new Map();
    let userBookmarks = new Set();
    if (req.user && posts.length > 0) {
      const postIds = posts.map(p => p._id);
      const [reactions, bookmarks] = await Promise.all([
        Reaction.find({ userId: req.user._id, postId: { $in: postIds } }),
        Bookmark.find({ userId: req.user._id, postId: { $in: postIds } })
      ]);

      reactions.forEach(r => {
        const key = `${r.postId.toString()}_${r.reactionType}`;
        userReactions.set(key, true);
      });

      bookmarks.forEach(b => {
        userBookmarks.add(b.postId.toString());
      });
    }

    const formattedPosts = posts.map(p => ({
      id: p._id,
      title: p.title,
      content: p.content,
      contentType: p.contentType,
      tags: p.tags || [],
      resourceLink: p.resourceLink || '',
      resourceTitle: p.resourceTitle || '',
      reactionsCount: p.reactionsCount || { like: 0, helpful: 0 },
      commentsCount: p.commentsCount || 0,
      isEdited: p.isEdited || false,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      author: p.authorId ? {
        id: p.authorId._id,
        name: p.authorId.name,
        email: p.authorId.email,
        role: p.authorId.role,
        systemRole: p.authorId.systemRole,
        institution: p.authorId.institution
      } : { name: 'Unknown User' },
      userReacted: {
        like: userReactions.has(`${p._id.toString()}_like`),
        helpful: userReactions.has(`${p._id.toString()}_helpful`)
      },
      isBookmarked: userBookmarks.has(p._id.toString()),
      canEdit: req.user ? (p.authorId && p.authorId._id.toString() === req.user._id.toString()) : false,
      canDelete: req.user ? (
        (p.authorId && p.authorId._id.toString() === req.user._id.toString()) ||
        ['admin', 'moderator'].includes(req.user.systemRole)
      ) : false
    }));

    res.json({
      success: true,
      posts: formattedPosts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + posts.length < total
      }
    });
  } catch (err) {
    console.error('Fetch posts error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve community posts.' });
  }
});

// POST /api/posts
router.post('/posts', requireAuth, async (req, res) => {
  try {
    const { title, content, contentType, tags, resourceLink, resourceTitle } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Post title is required.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Post content is required.' });
    }

    if (resourceLink && !isValidUrl(resourceLink)) {
      return res.status(400).json({ success: false, error: 'Provided resource link must be a valid http or https URL.' });
    }

    // Process skill tags (comma separated or array)
    let processedTags = [];
    if (Array.isArray(tags)) {
      processedTags = tags.map(t => sanitizeText(t).toLowerCase()).filter(Boolean);
    } else if (typeof tags === 'string') {
      processedTags = tags.split(',').map(t => sanitizeText(t).toLowerCase()).filter(Boolean);
    }

    const allowedTypes = ['notes', 'tutorial', 'learning-tip', 'resource-link', 'discussion'];
    const validContentType = allowedTypes.includes(contentType) ? contentType : 'notes';

    const post = await Post.create({
      authorId: req.user._id,
      title: sanitizeText(title),
      content: sanitizeText(content),
      contentType: validContentType,
      tags: processedTags,
      resourceLink: resourceLink ? resourceLink.trim() : '',
      resourceTitle: resourceTitle ? sanitizeText(resourceTitle) : '',
      reactionsCount: { like: 0, helpful: 0 },
      commentsCount: 0
    });

    const populated = await Post.findById(post._id).populate('authorId', 'name email role systemRole institution');

    const formatted = {
      id: populated._id,
      title: populated.title,
      content: populated.content,
      contentType: populated.contentType,
      tags: populated.tags,
      resourceLink: populated.resourceLink,
      resourceTitle: populated.resourceTitle,
      reactionsCount: populated.reactionsCount,
      commentsCount: 0,
      isEdited: false,
      createdAt: populated.createdAt,
      author: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        systemRole: req.user.systemRole,
        institution: req.user.institution
      },
      userReacted: { like: false, helpful: false },
      isBookmarked: false,
      canEdit: true,
      canDelete: true
    };

    // Broadcast live event via Socket.IO
    const io = getIO(req);
    if (io) {
      io.emit('post:created', formatted);
    }

    res.status(201).json({ success: true, post: formatted });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ success: false, error: 'Failed to create post.' });
  }
});

// GET /api/posts/:id
router.get('/posts/:id', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('authorId', 'name email role systemRole institution')
      .lean();
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    let isBookmarked = false;
    let userReacted = { like: false, helpful: false };
    if (req.user) {
      const [bm, reactions] = await Promise.all([
        Bookmark.findOne({ userId: req.user._id, postId: post._id }),
        Reaction.find({ userId: req.user._id, postId: post._id })
      ]);
      isBookmarked = !!bm;
      reactions.forEach(r => {
        if (r.reactionType === 'like') userReacted.like = true;
        if (r.reactionType === 'helpful') userReacted.helpful = true;
      });
    }

    res.json({
      success: true,
      post: {
        id: post._id,
        title: post.title,
        content: post.content,
        contentType: post.contentType,
        tags: post.tags || [],
        resourceLink: post.resourceLink || '',
        resourceTitle: post.resourceTitle || '',
        reactionsCount: post.reactionsCount,
        commentsCount: post.commentsCount,
        isEdited: post.isEdited,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: post.authorId ? {
          id: post.authorId._id,
          name: post.authorId.name,
          email: post.authorId.email,
          role: post.authorId.role,
          systemRole: post.authorId.systemRole,
          institution: post.authorId.institution
        } : null,
        userReacted,
        isBookmarked,
        canEdit: req.user ? post.authorId && post.authorId._id.toString() === req.user._id.toString() : false,
        canDelete: req.user ? (
          (post.authorId && post.authorId._id.toString() === req.user._id.toString()) ||
          ['admin', 'moderator'].includes(req.user.systemRole)
        ) : false
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load post details.' });
  }
});

// PUT /api/posts/:id
router.put('/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    // Enforce author ownership
    if (post.authorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'You are only permitted to edit your own posts.' });
    }

    const { title, content, contentType, tags, resourceLink, resourceTitle } = req.body;
    if (title && title.trim()) post.title = sanitizeText(title);
    if (content && content.trim()) post.content = sanitizeText(content);
    if (contentType) post.contentType = contentType;

    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        post.tags = tags.map(t => sanitizeText(t).toLowerCase()).filter(Boolean);
      } else if (typeof tags === 'string') {
        post.tags = tags.split(',').map(t => sanitizeText(t).toLowerCase()).filter(Boolean);
      }
    }

    if (resourceLink !== undefined) {
      if (resourceLink && !isValidUrl(resourceLink)) {
        return res.status(400).json({ success: false, error: 'Invalid resource link URL.' });
      }
      post.resourceLink = resourceLink.trim();
    }
    if (resourceTitle !== undefined) post.resourceTitle = sanitizeText(resourceTitle);

    post.isEdited = true;
    post.updatedAt = new Date();
    await post.save();

    const io = getIO(req);
    if (io) {
      io.emit('post:updated', {
        id: post._id,
        title: post.title,
        content: post.content,
        contentType: post.contentType,
        tags: post.tags,
        resourceLink: post.resourceLink,
        resourceTitle: post.resourceTitle,
        isEdited: true,
        updatedAt: post.updatedAt
      });
    }

    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update post.' });
  }
});

// DELETE /api/posts/:id
router.delete('/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isStaff = ['admin', 'moderator'].includes(req.user.systemRole);

    if (!isAuthor && !isStaff) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this post.' });
    }

    await Promise.all([
      Post.findByIdAndDelete(post._id),
      Comment.deleteMany({ postId: post._id }),
      Reaction.deleteMany({ postId: post._id }),
      Bookmark.deleteMany({ postId: post._id })
    ]);

    const io = getIO(req);
    if (io) {
      io.emit('post:deleted', { id: post._id });
    }

    res.json({ success: true, message: 'Post and associated records deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete post.' });
  }
});

// POST /api/posts/:id/reactions (Toggle reaction: Like / Helpful)
router.post('/posts/:id/reactions', requireAuth, async (req, res) => {
  try {
    const { reactionType } = req.body;
    if (!['like', 'helpful'].includes(reactionType)) {
      return res.status(400).json({ success: false, error: 'Invalid reaction type. Must be "like" or "helpful".' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    // Check if user already reacted with this type
    const existing = await Reaction.findOne({
      userId: req.user._id,
      postId: post._id,
      reactionType
    });

    let added = false;
    if (existing) {
      // Toggle OFF
      await Reaction.findByIdAndDelete(existing._id);
      post.reactionsCount[reactionType] = Math.max(0, (post.reactionsCount[reactionType] || 0) - 1);
      added = false;
    } else {
      // Toggle ON
      await Reaction.create({
        userId: req.user._id,
        postId: post._id,
        reactionType
      });
      post.reactionsCount[reactionType] = (post.reactionsCount[reactionType] || 0) + 1;
      added = true;
    }

    await post.save();

    const io = getIO(req);
    if (io) {
      io.emit('reaction:updated', {
        postId: post._id,
        reactionType,
        reactionsCount: post.reactionsCount,
        userId: req.user._id,
        added
      });
    }

    res.json({
      success: true,
      added,
      reactionType,
      reactionsCount: post.reactionsCount
    });
  } catch (err) {
    console.error('Reaction error:', err);
    res.status(500).json({ success: false, error: 'Failed to update reaction.' });
  }
});

// GET /api/posts/:id/comments
router.get('/posts/:id/comments', optionalAuth, async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.id })
      .sort({ createdAt: 1 })
      .populate('authorId', 'name email role systemRole')
      .lean();

    const formatted = comments.map(c => ({
      id: c._id,
      postId: c.postId,
      parentId: c.parentId,
      content: c.content,
      isEdited: c.isEdited,
      createdAt: c.createdAt,
      author: c.authorId ? {
        id: c.authorId._id,
        name: c.authorId.name,
        email: c.authorId.email,
        role: c.authorId.role,
        systemRole: c.authorId.systemRole
      } : { name: 'Unknown Member' },
      canDelete: req.user ? (
        (c.authorId && c.authorId._id.toString() === req.user._id.toString()) ||
        ['admin', 'moderator'].includes(req.user.systemRole)
      ) : false
    }));

    res.json({ success: true, comments: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load comments.' });
  }
});

// POST /api/posts/:id/comments
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content, parentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Comment content cannot be empty.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    let parentCommentId = null;
    if (parentId) {
      const parent = await Comment.findById(parentId);
      if (parent) parentCommentId = parent._id;
    }

    const comment = await Comment.create({
      postId: post._id,
      authorId: req.user._id,
      parentId: parentCommentId,
      content: sanitizeText(content)
    });

    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    const populated = await Comment.findById(comment._id).populate('authorId', 'name email role systemRole');

    const formatted = {
      id: populated._id,
      postId: populated.postId,
      parentId: populated.parentId,
      content: populated.content,
      isEdited: false,
      createdAt: populated.createdAt,
      author: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        systemRole: req.user.systemRole
      },
      canDelete: true
    };

    const io = getIO(req);
    if (io) {
      io.emit('comment:created', {
        postId: post._id,
        comment: formatted,
        commentsCount: post.commentsCount
      });
    }

    res.status(201).json({ success: true, comment: formatted, commentsCount: post.commentsCount });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ success: false, error: 'Failed to publish comment.' });
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found.' });
    }

    const isAuthor = comment.authorId.toString() === req.user._id.toString();
    const isStaff = ['admin', 'moderator'].includes(req.user.systemRole);

    if (!isAuthor && !isStaff) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this comment.' });
    }

    const postId = comment.postId;
    await Comment.findByIdAndDelete(comment._id);

    // Decrement comments count on post
    const post = await Post.findById(postId);
    if (post) {
      post.commentsCount = Math.max(0, (post.commentsCount || 0) - 1);
      await post.save();
    }

    const io = getIO(req);
    if (io) {
      io.emit('comment:deleted', {
        postId,
        commentId: comment._id,
        commentsCount: post ? post.commentsCount : 0
      });
    }

    res.json({ success: true, message: 'Comment deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete comment.' });
  }
});

// GET /api/bookmarks (Private to current user)
router.get('/bookmarks', requireAuth, async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'postId',
        populate: { path: 'authorId', select: 'name email role systemRole institution' }
      });

    const validBookmarks = bookmarks
      .filter(b => b.postId) // in case post was deleted
      .map(b => ({
        bookmarkId: b._id,
        createdAt: b.createdAt,
        post: {
          id: b.postId._id,
          title: b.postId.title,
          content: b.postId.content,
          contentType: b.postId.contentType,
          tags: b.postId.tags || [],
          resourceLink: b.postId.resourceLink,
          resourceTitle: b.postId.resourceTitle,
          reactionsCount: b.postId.reactionsCount,
          commentsCount: b.postId.commentsCount,
          createdAt: b.postId.createdAt,
          author: b.postId.authorId ? {
            id: b.postId.authorId._id,
            name: b.postId.authorId.name,
            email: b.postId.authorId.email,
            role: b.postId.authorId.role
          } : null
        }
      }));

    res.json({ success: true, bookmarks: validBookmarks });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to retrieve bookmarks.' });
  }
});

// POST /api/bookmarks/:postId (Toggle bookmark)
router.post('/bookmarks/:postId', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    const existing = await Bookmark.findOne({
      userId: req.user._id,
      postId: post._id
    });

    let isBookmarked = false;
    if (existing) {
      await Bookmark.findByIdAndDelete(existing._id);
      isBookmarked = false;
    } else {
      await Bookmark.create({
        userId: req.user._id,
        postId: post._id
      });
      isBookmarked = true;
    }

    res.json({ success: true, isBookmarked });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to toggle bookmark.' });
  }
});

/* =====================================================================
   3. TRUST SCORE & SKILL VERIFICATION MODULE
   ===================================================================== */

// GET /api/sessions/completed (Verified completed sessions between users)
router.get('/sessions/completed', requireAuth, async (req, res) => {
  try {
    const { partnerId } = req.query;
    const query = {
      $or: [{ mentorId: req.user._id }, { learnerId: req.user._id }],
      status: 'completed'
    };

    if (partnerId) {
      query.$and = [
        { $or: [{ mentorId: req.user._id }, { learnerId: req.user._id }] },
        { $or: [{ mentorId: partnerId }, { learnerId: partnerId }] }
      ];
    }

    const sessions = await LearningSession.find(query)
      .sort({ date: -1 })
      .populate('mentorId', 'name email role')
      .populate('learnerId', 'name email role')
      .lean();

    // Check which sessions current user has already reviewed
    const sessionIds = sessions.map(s => s._id);
    const myReviews = await Review.find({
      sessionId: { $in: sessionIds },
      reviewerId: req.user._id
    });
    const reviewedSessionMap = new Map();
    myReviews.forEach(r => reviewedSessionMap.set(r.sessionId.toString(), r));

    const formatted = sessions.map(s => {
      const partner = s.mentorId._id.toString() === req.user._id.toString() ? s.learnerId : s.mentorId;
      const myRole = s.mentorId._id.toString() === req.user._id.toString() ? 'Mentor' : 'Learner';
      const existingReview = reviewedSessionMap.get(s._id.toString());

      return {
        id: s._id,
        skill: s.skill,
        category: s.category,
        minutes: s.minutes,
        date: s.date,
        notes: s.notes,
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          role: partner.role
        },
        myRole,
        hasReviewed: !!existingReview,
        review: existingReview ? {
          id: existingReview._id,
          rating: existingReview.rating,
          comment: existingReview.comment
        } : null
      };
    });

    res.json({ success: true, sessions: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to retrieve completed sessions.' });
  }
});

// POST /api/sessions/complete (Record a verified completed session)
router.post('/sessions/complete', requireAuth, async (req, res) => {
  try {
    const { partnerId, skill, category, minutes, notes, date } = req.body;
    if (!partnerId || !skill) {
      return res.status(400).json({ success: false, error: 'Partner ID and skill are required.' });
    }

    if (partnerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot complete a session with yourself.' });
    }

    const partner = await User.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner user not found.' });
    }

    const session = await LearningSession.create({
      mentorId: req.user._id,
      learnerId: partner._id,
      skill: sanitizeText(skill),
      category: category ? sanitizeText(category) : 'General',
      minutes: Number(minutes) || 60,
      notes: notes ? sanitizeText(notes) : '',
      date: date ? new Date(date) : new Date(),
      status: 'completed'
    });

    const io = getIO(req);
    if (io) {
      io.emit('session:completed', {
        sessionId: session._id,
        mentorId: req.user._id,
        learnerId: partner._id,
        skill: session.skill
      });
    }

    res.status(201).json({ success: true, session });
  } catch (err) {
    console.error('Session complete error:', err);
    res.status(500).json({ success: false, error: 'Failed to record completed session.' });
  }
});

// POST /api/reviews
// CRITICAL BACKEND ENFORCEMENT:
// Rate and review a learning partner ONLY after a verified completed session between them!
router.post('/reviews', requireAuth, async (req, res) => {
  try {
    const { sessionId, rating, comment, skill } = req.body;
    if (!sessionId || !rating || !comment) {
      return res.status(400).json({ success: false, error: 'Session ID, rating (1-5), and review comment are required.' });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be an integer between 1 and 5 stars.' });
    }

    // 1. Verify that the session exists and is completed
    const session = await LearningSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Specified learning session not found.' });
    }
    if (session.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Reviews are only permitted for confirmed, completed learning sessions.'
      });
    }

    // 2. Verify that the reviewer participated in this session (as mentor or learner)
    const isMentor = session.mentorId.toString() === req.user._id.toString();
    const isLearner = session.learnerId.toString() === req.user._id.toString();

    if (!isMentor && !isLearner) {
      return res.status(403).json({
        success: false,
        error: 'You can only review a learning partner from a session you personally participated in.'
      });
    }

    // Determine the reviewee (the other participant)
    const revieweeId = isMentor ? session.learnerId : session.mentorId;

    // 3. Enforce: exactly ONE review per reviewer per completed session
    const existingReview = await Review.findOne({
      sessionId: session._id,
      reviewerId: req.user._id
    });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted a review for this completed session.'
      });
    }

    // 4. Create Review
    const review = await Review.create({
      sessionId: session._id,
      reviewerId: req.user._id,
      revieweeId,
      rating: Math.round(numRating),
      comment: sanitizeText(comment),
      skill: sanitizeText(skill || session.skill)
    });

    // Calculate updated trust score for reviewee
    const trustMetrics = await calculateUserTrustMetrics(revieweeId);

    const io = getIO(req);
    if (io) {
      io.emit('review:created', {
        review: {
          id: review._id,
          sessionId: review.sessionId,
          reviewer: { id: req.user._id, name: req.user.name },
          revieweeId,
          rating: review.rating,
          comment: review.comment,
          skill: review.skill,
          createdAt: review.createdAt
        },
        revieweeTrust: trustMetrics
      });
    }

    res.status(201).json({
      success: true,
      review,
      trustMetrics
    });
  } catch (err) {
    console.error('Review error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit review.' });
  }
});

// GET /api/reviews/user/:userId
router.get('/reviews/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ revieweeId: req.params.userId })
      .sort({ createdAt: -1 })
      .populate('reviewerId', 'name email role institution')
      .lean();

    res.json({
      success: true,
      reviews: reviews.map(r => ({
        id: r._id,
        sessionId: r.sessionId,
        rating: r.rating,
        comment: r.comment,
        skill: r.skill,
        createdAt: r.createdAt,
        reviewer: r.reviewerId ? {
          id: r.reviewerId._id,
          name: r.reviewerId.name,
          email: r.reviewerId.email,
          role: r.reviewerId.role,
          institution: r.reviewerId.institution
        } : { name: 'Anonymous Peer' }
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load reviews.' });
  }
});

// POST /api/endorsements
// CRITICAL BACKEND ENFORCEMENT:
// Peer endorsements: store endorser, recipient, skill, date, optional evidence.
// Prevent self-endorsements and duplicate endorsements for the same skill and endorser.
router.post('/endorsements', requireAuth, async (req, res) => {
  try {
    const { recipientId, skill, comment, evidenceUrl } = req.body;
    if (!recipientId || !skill || !skill.trim()) {
      return res.status(400).json({ success: false, error: 'Recipient ID and demonstrated skill name are required.' });
    }

    // 1. Prevent self-endorsements
    if (recipientId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Self-endorsements are prohibited. Trust is earned through peer validation.'
      });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, error: 'Recipient user not found.' });
    }

    const cleanSkill = skill.trim();

    // 2. Prevent duplicate endorsements for the same skill and endorser
    const existing = await Endorsement.findOne({
      endorserId: req.user._id,
      recipientId: recipient._id,
      skill: cleanSkill
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `You have already endorsed ${recipient.name} for "${cleanSkill}".`
      });
    }

    if (evidenceUrl && !isValidUrl(evidenceUrl)) {
      return res.status(400).json({ success: false, error: 'Evidence link must be a valid URL.' });
    }

    const endorsement = await Endorsement.create({
      endorserId: req.user._id,
      recipientId: recipient._id,
      skill: cleanSkill,
      comment: comment ? sanitizeText(comment) : '',
      evidenceUrl: evidenceUrl ? evidenceUrl.trim() : ''
    });

    const trustMetrics = await calculateUserTrustMetrics(recipient._id);

    const io = getIO(req);
    if (io) {
      io.emit('endorsement:created', {
        endorsement: {
          id: endorsement._id,
          endorser: { id: req.user._id, name: req.user.name },
          recipientId: recipient._id,
          skill: cleanSkill,
          comment: endorsement.comment,
          evidenceUrl: endorsement.evidenceUrl,
          createdAt: endorsement.createdAt
        },
        recipientTrust: trustMetrics
      });
    }

    res.status(201).json({
      success: true,
      endorsement,
      trustMetrics
    });
  } catch (err) {
    console.error('Endorsement error:', err);
    res.status(500).json({ success: false, error: 'Failed to record peer endorsement.' });
  }
});

// GET /api/endorsements/user/:userId
router.get('/endorsements/user/:userId', async (req, res) => {
  try {
    const endorsements = await Endorsement.find({ recipientId: req.params.userId })
      .sort({ createdAt: -1 })
      .populate('endorserId', 'name email role institution')
      .lean();

    res.json({
      success: true,
      endorsements: endorsements.map(e => ({
        id: e._id,
        skill: e.skill,
        comment: e.comment,
        evidenceUrl: e.evidenceUrl,
        createdAt: e.createdAt,
        endorser: e.endorserId ? {
          id: e.endorserId._id,
          name: e.endorserId.name,
          email: e.endorserId.email,
          role: e.endorserId.role,
          institution: e.endorserId.institution
        } : { name: 'Anonymous Peer' }
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load endorsements.' });
  }
});

// POST /api/verifications (Submit skill verification request)
router.post('/verifications', requireAuth, async (req, res) => {
  try {
    const { skill, category, evidenceUrl, notes } = req.body;
    if (!skill || !skill.trim()) {
      return res.status(400).json({ success: false, error: 'Skill name is required.' });
    }
    if (!evidenceUrl || !isValidUrl(evidenceUrl)) {
      return res.status(400).json({
        success: false,
        error: 'A valid evidence URL (GitHub, portfolio, certificate, or publication) is required.'
      });
    }

    const cleanSkill = skill.trim();

    // Check if verification already approved or pending
    const existing = await SkillVerification.findOne({
      userId: req.user._id,
      skill: cleanSkill,
      status: { $in: ['approved', 'pending'] }
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `A verification request for "${cleanSkill}" is already ${existing.status}.`
      });
    }

    const verification = await SkillVerification.create({
      userId: req.user._id,
      skill: cleanSkill,
      category: category ? sanitizeText(category) : 'General',
      evidenceUrl: evidenceUrl.trim(),
      notes: notes ? sanitizeText(notes) : '',
      status: 'pending'
    });

    const io = getIO(req);
    if (io) {
      io.emit('verification:submitted', {
        id: verification._id,
        user: { id: req.user._id, name: req.user.name },
        skill: cleanSkill
      });
    }

    res.status(201).json({ success: true, verification });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to submit verification request.' });
  }
});

// GET /api/verifications/my
router.get('/verifications/my', requireAuth, async (req, res) => {
  try {
    const list = await SkillVerification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'name email');

    res.json({ success: true, verifications: list });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load verification requests.' });
  }
});

// GET /api/verifications (Admin / Moderator only)
router.get('/verifications', requireAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const list = await SkillVerification.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role institution')
      .populate('reviewedBy', 'name email');

    res.json({ success: true, verifications: list });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load verification list.' });
  }
});

// PATCH /api/verifications/:id (Admin / Moderator Approve or Reject)
router.patch('/verifications/:id', requireAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status, reviewerNotes } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be "approved" or "rejected".' });
    }

    const verification = await SkillVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ success: false, error: 'Verification request not found.' });
    }

    verification.status = status;
    verification.reviewerNotes = reviewerNotes ? sanitizeText(reviewerNotes) : '';
    verification.reviewedBy = req.user._id;
    verification.reviewedAt = new Date();
    await verification.save();

    const targetUserTrust = await calculateUserTrustMetrics(verification.userId);

    const io = getIO(req);
    if (io) {
      io.emit('verification:resolved', {
        id: verification._id,
        userId: verification.userId,
        status,
        skill: verification.skill,
        reviewedBy: req.user.name,
        targetUserTrust
      });
    }

    res.json({ success: true, verification, targetUserTrust });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to review verification.' });
  }
});

/* =====================================================================
   4. REPORTING & BLOCKING
   ===================================================================== */

// POST /api/reports
router.post('/reports', requireAuth, async (req, res) => {
  try {
    const { targetType, targetId, reason, details } = req.body;
    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ success: false, error: 'Target type, target ID, and reason are required.' });
    }
    if (!['post', 'comment', 'review', 'user'].includes(targetType)) {
      return res.status(400).json({ success: false, error: 'Invalid report target type.' });
    }

    const report = await Report.create({
      reporterId: req.user._id,
      targetType,
      targetId,
      reason: sanitizeText(reason),
      details: details ? sanitizeText(details) : '',
      status: 'pending'
    });

    const io = getIO(req);
    if (io) {
      io.emit('report:created', {
        id: report._id,
        targetType,
        reason: report.reason
      });
    }

    res.status(201).json({
      success: true,
      message: 'Thank you. Your report has been securely submitted for moderator review.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to submit moderation report.' });
  }
});

// GET /api/reports (Admin / Moderator only)
router.get('/reports', requireAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .populate('reporterId', 'name email')
      .populate('reviewedBy', 'name email');

    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load reports.' });
  }
});

// PATCH /api/reports/:id (Admin / Moderator resolve)
router.patch('/reports/:id', requireAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const { status, resolutionNotes, takeAction } = req.body;
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be "resolved" or "dismissed".' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    report.status = status;
    report.resolutionNotes = resolutionNotes ? sanitizeText(resolutionNotes) : '';
    report.reviewedBy = req.user._id;
    await report.save();

    // If takeAction is requested, remove the reported entity
    if (status === 'resolved' && takeAction) {
      if (report.targetType === 'post') {
        await Post.findByIdAndDelete(report.targetId);
        const io = getIO(req);
        if (io) io.emit('post:deleted', { id: report.targetId });
      } else if (report.targetType === 'comment') {
        await Comment.findByIdAndDelete(report.targetId);
        const io = getIO(req);
        if (io) io.emit('comment:deleted', { commentId: report.targetId });
      } else if (report.targetType === 'review') {
        await Review.findByIdAndDelete(report.targetId);
      }
    }

    const io = getIO(req);
    if (io) {
      io.emit('report:resolved', { id: report._id, status });
    }

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update report.' });
  }
});

// POST /api/blocks
router.post('/blocks', requireAuth, async (req, res) => {
  try {
    const { blockedId } = req.body;
    if (!blockedId) {
      return res.status(400).json({ success: false, error: 'Target user ID to block is required.' });
    }
    if (blockedId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot block yourself.' });
    }

    const existing = await Block.findOne({
      blockerId: req.user._id,
      blockedId
    });

    if (!existing) {
      await Block.create({
        blockerId: req.user._id,
        blockedId
      });
    }

    res.json({ success: true, message: 'User blocked. You will no longer receive direct interactions or content from this user.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to block user.' });
  }
});

// DELETE /api/blocks/:blockedId
router.delete('/blocks/:blockedId', requireAuth, async (req, res) => {
  try {
    await Block.findOneAndDelete({
      blockerId: req.user._id,
      blockedId: req.params.blockedId
    });
    res.json({ success: true, message: 'User unblocked.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to unblock user.' });
  }
});

// GET /api/blocks
router.get('/blocks', requireAuth, async (req, res) => {
  try {
    const blocks = await Block.find({ blockerId: req.user._id }).populate('blockedId', 'name email role');
    res.json({
      success: true,
      blocks: blocks.map(b => ({
        id: b._id,
        user: b.blockedId ? {
          id: b.blockedId._id,
          name: b.blockedId.name,
          email: b.blockedId.email
        } : null
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch blocks list.' });
  }
});

// GET /api/moderation/overview (Admin / Moderator overview stats)
router.get('/moderation/overview', requireAuth, requireRole(['admin', 'moderator']), async (req, res) => {
  try {
    const [pendingVerifications, pendingReports, totalUsers, totalPosts] = await Promise.all([
      SkillVerification.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'pending' }),
      User.countDocuments(),
      Post.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        pendingVerifications,
        pendingReports,
        totalUsers,
        totalPosts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load moderation stats.' });
  }
});

/* =====================================================================
   4. LEARNING REQUESTS & SESSION MANAGEMENT (PHASE 5)
   ===================================================================== */

// GET /api/sessions (List learning sessions for current user with status filter)
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const query = {
      $or: [{ mentorId: req.user._id }, { learnerId: req.user._id }]
    };
    if (status && status !== 'all') {
      query.status = status;
    }

    const sessions = await LearningSession.find(query)
      .sort({ date: -1 })
      .populate('mentorId', 'name email role institution')
      .populate('learnerId', 'name email role institution')
      .lean();

    const formatted = sessions.map(s => {
      const isMentor = s.mentorId._id.toString() === req.user._id.toString();
      const partner = isMentor ? s.learnerId : s.mentorId;
      return {
        id: s._id,
        skill: s.skill,
        teachSkill: s.teachSkill || '',
        learnSkill: s.learnSkill || '',
        category: s.category || 'General',
        date: s.date,
        time: s.time || '18:00',
        minutes: s.minutes || 60,
        status: s.status,
        message: s.message || '',
        notes: s.notes || '',
        myRole: isMentor ? 'Mentor' : 'Learner',
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          role: partner.role,
          institution: partner.institution
        },
        cancelledBy: s.cancelledBy,
        cancelReason: s.cancelReason,
        rescheduledTo: s.rescheduledTo,
        completedAt: s.completedAt,
        createdAt: s.createdAt
      };
    });

    res.json({ success: true, sessions: formatted });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve sessions.' });
  }
});

// POST /api/sessions/request or /api/sessions (Phase 5 - Request a learning session with booking conflict check)
router.post(['/sessions/request', '/sessions'], requireAuth, async (req, res) => {
  try {
    const { partnerId, skill, teachSkill, learnSkill, category, date, time, duration, message } = req.body;
    if (!partnerId || !skill || !date) {
      return res.status(400).json({ success: false, error: 'Partner, skill, and session date are required.' });
    }

    if (partnerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot create a session with yourself.' });
    }

    const partner = await User.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner user not found.' });
    }

    // Check blocks
    const isBlocked = await Block.findOne({
      $or: [
        { blockerId: req.user._id, blockedId: partner._id },
        { blockerId: partner._id, blockedId: req.user._id }
      ]
    });
    if (isBlocked) {
      return res.status(403).json({ success: false, error: 'Cannot propose sessions with this user due to privacy/blocking settings.' });
    }

    // Booking Conflict Check
    const sessionDate = new Date(date);
    const sessionTime = (time || '18:00').trim();
    const startOfDay = new Date(sessionDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(sessionDate); endOfDay.setHours(23, 59, 59, 999);

    const conflictingSession = await LearningSession.findOne({
      $or: [
        { mentorId: req.user._id },
        { learnerId: req.user._id },
        { mentorId: partner._id },
        { learnerId: partner._id }
      ],
      status: { $in: ['accepted', 'pending'] },
      date: { $gte: startOfDay, $lte: endOfDay },
      time: sessionTime
    });

    if (conflictingSession) {
      return res.status(409).json({
        success: false,
        error: `Schedule Conflict: A session is already scheduled on ${sessionDate.toLocaleDateString()} at ${sessionTime}. Please choose a different time.`
      });
    }

    const session = await LearningSession.create({
      mentorId: req.user._id,
      learnerId: partner._id,
      skill: sanitizeText(skill),
      teachSkill: sanitizeText(teachSkill || skill),
      learnSkill: sanitizeText(learnSkill || ''),
      category: sanitizeText(category || 'General'),
      date: sessionDate,
      time: sessionTime,
      duration: Number(duration) || 60,
      minutes: Number(duration) || 60,
      message: sanitizeText(message || ''),
      status: 'pending'
    });

    // Create Notification for recipient
    await Notification.create({
      userId: partner._id,
      senderId: req.user._id,
      type: 'request',
      title: 'New Learning Session Request',
      message: `${req.user.name} sent you a learning request for ${session.skill} on ${sessionDate.toLocaleDateString()} at ${sessionTime}.`,
      link: '#sessions'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${partner._id}`).emit('session:new_request', {
        sessionId: session._id,
        fromUser: req.user.name,
        skill: session.skill
      });
      io.to(`user:${partner._id}`).emit('notification', {
        type: 'request',
        title: 'New Learning Session Request',
        message: `${req.user.name} proposed a session for ${session.skill}.`
      });
    }

    res.status(201).json({ success: true, message: 'Learning session request sent successfully.', session });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ success: false, error: 'Failed to request learning session.' });
  }
});

// PATCH /api/sessions/:id/accept
router.patch('/sessions/:id/accept', requireAuth, async (req, res) => {
  try {
    const session = await LearningSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.mentorId.toString() !== req.user._id.toString() && session.learnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to accept this session.' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot accept session with status ${session.status}.` });
    }

    session.status = 'accepted';
    session.updatedAt = new Date();
    await session.save();

    const otherUserId = session.mentorId.toString() === req.user._id.toString() ? session.learnerId : session.mentorId;

    await Notification.create({
      userId: otherUserId,
      senderId: req.user._id,
      type: 'session_accepted',
      title: 'Learning Session Accepted',
      message: `${req.user.name} accepted your session request for ${session.skill}.`,
      link: '#sessions'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${otherUserId}`).emit('session:accepted', { sessionId: session._id });
      io.to(`user:${otherUserId}`).emit('notification', {
        type: 'session_accepted',
        title: 'Learning Session Confirmed',
        message: `${req.user.name} confirmed the session for ${session.skill}.`
      });
    }

    res.json({ success: true, message: 'Session accepted successfully.', session });
  } catch (err) {
    console.error('Accept session error:', err);
    res.status(500).json({ success: false, error: 'Failed to accept session.' });
  }
});

// PATCH /api/sessions/:id/reject
router.patch('/sessions/:id/reject', requireAuth, async (req, res) => {
  try {
    const session = await LearningSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.mentorId.toString() !== req.user._id.toString() && session.learnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to reject this session.' });
    }

    session.status = 'rejected';
    session.updatedAt = new Date();
    await session.save();

    const otherUserId = session.mentorId.toString() === req.user._id.toString() ? session.learnerId : session.mentorId;
    await Notification.create({
      userId: otherUserId,
      senderId: req.user._id,
      type: 'system',
      title: 'Learning Session Declined',
      message: `${req.user.name} was unable to accept your session request for ${session.skill}.`,
      link: '#sessions'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${otherUserId}`).emit('session:rejected', { sessionId: session._id });
    }

    res.json({ success: true, message: 'Session rejected.', session });
  } catch (err) {
    console.error('Reject session error:', err);
    res.status(500).json({ success: false, error: 'Failed to reject session.' });
  }
});

// PATCH /api/sessions/:id/cancel
router.patch('/sessions/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const session = await LearningSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.mentorId.toString() !== req.user._id.toString() && session.learnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to cancel this session.' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot cancel an already completed session.' });
    }

    session.status = 'cancelled';
    session.cancelledBy = req.user._id;
    session.cancelReason = sanitizeText(cancelReason || 'Cancelled by participant');
    session.updatedAt = new Date();
    await session.save();

    const otherUserId = session.mentorId.toString() === req.user._id.toString() ? session.learnerId : session.mentorId;
    await Notification.create({
      userId: otherUserId,
      senderId: req.user._id,
      type: 'session_cancelled',
      title: 'Learning Session Cancelled',
      message: `${req.user.name} cancelled the session for ${session.skill}. Reason: ${session.cancelReason}`,
      link: '#sessions'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${otherUserId}`).emit('session:cancelled', { sessionId: session._id });
    }

    res.json({ success: true, message: 'Session cancelled.', session });
  } catch (err) {
    console.error('Cancel session error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel session.' });
  }
});

// PATCH /api/sessions/:id/reschedule
router.patch('/sessions/:id/reschedule', requireAuth, async (req, res) => {
  try {
    const { date, time } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, error: 'New session date is required.' });
    }

    const session = await LearningSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.mentorId.toString() !== req.user._id.toString() && session.learnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Unauthorized to reschedule this session.' });
    }

    const newDate = new Date(date);
    const newTime = (time || session.time || '18:00').trim();

    // Check conflict
    const startOfDay = new Date(newDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(newDate); endOfDay.setHours(23, 59, 59, 999);
    const conflict = await LearningSession.findOne({
      _id: { $ne: session._id },
      $or: [
        { mentorId: session.mentorId },
        { learnerId: session.mentorId },
        { mentorId: session.learnerId },
        { learnerId: session.learnerId }
      ],
      status: { $in: ['accepted', 'pending'] },
      date: { $gte: startOfDay, $lte: endOfDay },
      time: newTime
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: `Schedule conflict: A session already exists on ${newDate.toLocaleDateString()} at ${newTime}.`
      });
    }

    session.rescheduledTo = { date: newDate, time: newTime };
    session.date = newDate;
    session.time = newTime;
    session.status = 'accepted';
    session.updatedAt = new Date();
    await session.save();

    const otherUserId = session.mentorId.toString() === req.user._id.toString() ? session.learnerId : session.mentorId;
    await Notification.create({
      userId: otherUserId,
      senderId: req.user._id,
      type: 'session_accepted',
      title: 'Session Rescheduled',
      message: `${req.user.name} rescheduled the ${session.skill} session to ${newDate.toLocaleDateString()} at ${newTime}.`,
      link: '#sessions'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${otherUserId}`).emit('session:rescheduled', { sessionId: session._id, newDate, newTime });
    }

    res.json({ success: true, message: 'Session rescheduled successfully.', session });
  } catch (err) {
    console.error('Reschedule session error:', err);
    res.status(500).json({ success: false, error: 'Failed to reschedule session.' });
  }
});

// PATCH /api/sessions/:id/complete (Authorized completion workflow)
router.patch('/sessions/:id/complete', requireAuth, async (req, res) => {
  try {
    const session = await LearningSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    if (session.mentorId.toString() !== req.user._id.toString() && session.learnerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only participants can mark a session completed.' });
    }

    if (session.status === 'completed') {
      return res.json({ success: true, message: 'Session is already completed.', session });
    }

    session.status = 'completed';
    session.completedAt = new Date();
    session.completedBy = req.user._id;
    session.updatedAt = new Date();
    await session.save();

    const mentor = await User.findById(session.mentorId);
    const learner = await User.findById(session.learnerId);

    await Activity.create([
      {
        userId: session.mentorId,
        type: 'taught',
        skill: session.skill,
        partner: learner ? learner.name : 'Peer',
        partnerId: session.learnerId,
        minutes: session.minutes || 60,
        date: session.completedAt,
        notes: session.notes || 'Completed exchange session',
        sessionId: session._id
      },
      {
        userId: session.learnerId,
        type: 'learned',
        skill: session.skill,
        partner: mentor ? mentor.name : 'Mentor',
        partnerId: session.mentorId,
        minutes: session.minutes || 60,
        date: session.completedAt,
        notes: session.notes || 'Completed exchange session',
        sessionId: session._id
      }
    ]);

    const otherUserId = session.mentorId.toString() === req.user._id.toString() ? session.learnerId : session.mentorId;
    await Notification.create({
      userId: otherUserId,
      senderId: req.user._id,
      type: 'session_completed',
      title: 'Session Marked Completed',
      message: `${req.user.name} marked your session for ${session.skill} as completed! You can now leave a peer review and endorsement.`,
      link: '#trust'
    });

    const io = getIO(req);
    if (io) {
      io.to(`user:${otherUserId}`).emit('session:completed', { sessionId: session._id, skill: session.skill });
      io.emit('session:completed', { sessionId: session._id, mentorId: session.mentorId, learnerId: session.learnerId, skill: session.skill });
    }

    res.json({ success: true, message: 'Session marked as completed. You can now leave a review!', session });
  } catch (err) {
    console.error('Complete session error:', err);
    res.status(500).json({ success: false, error: 'Failed to complete session.' });
  }
});

/* =====================================================================
   5. LIVE 1-ON-1 CHAT & NOTIFICATIONS (PHASE 6)
   ===================================================================== */

// GET /api/conversations
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const convs = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'name email role institution')
      .lean();

    const formatted = convs.map(c => {
      const partner = c.participants.find(p => p._id.toString() !== userId.toString()) || c.participants[0];
      const unreadCount = (c.unreadCounts && c.unreadCounts[userId.toString()]) || 0;
      return {
        id: c._id,
        partner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          role: partner.role,
          institution: partner.institution
        },
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount
      };
    });

    res.json({ success: true, conversations: formatted });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve conversations.' });
  }
});

// POST /api/conversations (Find or start conversation)
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const partnerId = req.body.partnerId || req.body.recipientId;
    if (!partnerId) {
      return res.status(400).json({ success: false, error: 'Partner ID or recipient ID is required.' });
    }
    if (partnerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot start conversation with yourself.' });
    }

    const partner = await User.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    // Check blocks
    const isBlocked = await Block.findOne({
      $or: [
        { blockerId: req.user._id, blockedId: partner._id },
        { blockerId: partner._id, blockedId: req.user._id }
      ]
    });
    if (isBlocked) {
      return res.status(403).json({ success: false, error: 'Cannot communicate with this user due to privacy/blocking settings.' });
    }

    let conv = await Conversation.findOne({
      participants: { $all: [req.user._id, partner._id] }
    }).populate('participants', 'name email role institution');

    if (!conv) {
      conv = await Conversation.create({
        participants: [req.user._id, partner._id],
        lastMessage: '',
        unreadCounts: {}
      });
      conv = await Conversation.findById(conv._id).populate('participants', 'name email role institution');
    }

    const partnerInfo = conv.participants.find(p => p._id.toString() !== req.user._id.toString());
    res.json({
      success: true,
      conversation: {
        id: conv._id,
        partner: {
          id: partnerInfo._id,
          name: partnerInfo.name,
          email: partnerInfo.email,
          role: partnerInfo.role
        },
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt
      }
    });
  } catch (err) {
    console.error('Start conversation error:', err);
    res.status(500).json({ success: false, error: 'Failed to start conversation.' });
  }
});

// GET /api/conversations/:id/messages
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }

    const isParticipant = conv.participants.some(p => p.toString() === req.user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this conversation.' });
    }

    const messages = await Message.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name email')
      .lean();

    // Mark unread messages sent to current user as read
    await Message.updateMany(
      { conversationId: conv._id, recipientId: req.user._id, isRead: false },
      { isRead: true }
    );

    // Reset unread count for current user
    if (conv.unreadCounts) {
      conv.unreadCounts.set(req.user._id.toString(), 0);
      await conv.save();
    }

    const formatted = messages.map(m => ({
      id: m._id,
      conversationId: m.conversationId,
      sender: {
        id: m.senderId._id,
        name: m.senderId.name
      },
      recipientId: m.recipientId,
      text: m.text,
      isRead: m.isRead,
      createdAt: m.createdAt
    }));

    res.json({ success: true, messages: formatted });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve messages.' });
  }
});

// POST /api/conversations/:id/messages
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Message text cannot be empty.' });
    }

    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }

    const isParticipant = conv.participants.some(p => p.toString() === req.user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Unauthorized to message in this conversation.' });
    }

    const recipientId = conv.participants.find(p => p.toString() !== req.user._id.toString());

    // Check blocking
    const isBlocked = await Block.findOne({
      $or: [
        { blockerId: req.user._id, blockedId: recipientId },
        { blockerId: recipientId, blockedId: req.user._id }
      ]
    });
    if (isBlocked) {
      return res.status(403).json({ success: false, error: 'Cannot send message to this user due to block settings.' });
    }

    const cleanText = sanitizeText(text);
    const msg = await Message.create({
      conversationId: conv._id,
      senderId: req.user._id,
      recipientId,
      text: cleanText,
      isRead: false
    });

    conv.lastMessage = cleanText;
    conv.lastMessageSenderId = req.user._id;
    conv.lastMessageAt = new Date();
    const currentUnread = (conv.unreadCounts && conv.unreadCounts.get(recipientId.toString())) || 0;
    conv.unreadCounts.set(recipientId.toString(), currentUnread + 1);
    await conv.save();

    await Notification.create({
      userId: recipientId,
      senderId: req.user._id,
      type: 'message',
      title: 'New Chat Message',
      message: `${req.user.name}: ${cleanText.slice(0, 60)}${cleanText.length > 60 ? '...' : ''}`,
      link: '#messages'
    });

    const io = getIO(req);
    if (io) {
      const payload = {
        id: msg._id,
        conversationId: conv._id,
        sender: { id: req.user._id, name: req.user.name },
        recipientId,
        text: cleanText,
        createdAt: msg.createdAt
      };
      io.to(`conv:${conv._id}`).emit('chat:message', payload);
      io.to(`user:${recipientId}`).emit('chat:message', payload);
      io.to(`user:${recipientId}`).emit('notification', {
        type: 'message',
        title: 'New Chat Message',
        message: `${req.user.name}: ${cleanText.slice(0, 60)}`
      });
    }

    res.status(201).json({
      success: true,
      message: {
        id: msg._id,
        conversationId: conv._id,
        sender: { id: req.user._id, name: req.user.name },
        recipientId,
        text: cleanText,
        createdAt: msg.createdAt
      }
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message.' });
  }
});

// Notifications Endpoints
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      notifications: notifs.map(n => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: n.isRead,
        createdAt: n.createdAt
      })),
      unreadCount
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve notifications.' });
  }
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true }
    );
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update notification.' });
  }
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to clear unread notifications.' });
  }
});

/* =====================================================================
   6. LEARNING ANALYTICS & GOALS / ACTIVITIES (PHASE 8)
   ===================================================================== */

// GET /api/analytics (Phase 8 - MongoDB Aggregation Pipelines)
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Session stats aggregation
    const sessionAgg = await LearningSession.aggregate([
      {
        $match: {
          $or: [{ mentorId: userId }, { learnerId: userId }],
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          totalMinutes: { $sum: '$minutes' },
          skills: { $addToSet: '$skill' }
        }
      }
    ]);

    const totalSessions = sessionAgg[0]?.totalCompleted || 0;
    const totalMinutes = sessionAgg[0]?.totalMinutes || 0;
    const totalHours = Number((totalMinutes / 60).toFixed(1));

    // 2. Skills taught vs skills learned
    const taughtCount = await LearningSession.countDocuments({ mentorId: userId, status: 'completed' });
    const learnedCount = await LearningSession.countDocuments({ learnerId: userId, status: 'completed' });

    // 3. Weekly Activity over last 8 weeks
    const eightWeeksAgo = new Date(Date.now() - 56 * 86400000);
    const weeklyActivity = await LearningSession.aggregate([
      {
        $match: {
          $or: [{ mentorId: userId }, { learnerId: userId }],
          status: 'completed',
          date: { $gte: eightWeeksAgo }
        }
      },
      {
        $group: {
          _id: { $isoWeek: '$date' },
          count: { $sum: 1 },
          minutes: { $sum: '$minutes' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // 4. Learning streak calculation (Distinct days with activity or completed sessions)
    const allActivities = await Activity.find({ userId }).select('date').sort({ date: -1 }).lean();
    const completedSess = await LearningSession.find({
      $or: [{ mentorId: userId }, { learnerId: userId }],
      status: 'completed'
    }).select('date completedAt').sort({ date: -1 }).lean();

    const distinctDays = new Set();
    allActivities.forEach(a => distinctDays.add(new Date(a.date).toISOString().slice(0, 10)));
    completedSess.forEach(s => distinctDays.add(new Date(s.completedAt || s.date).toISOString().slice(0, 10)));

    const sortedDays = Array.from(distinctDays).sort().reverse();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    if (sortedDays.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      let checkingDate = new Date();
      if (!distinctDays.has(todayStr) && distinctDays.has(yesterdayStr)) {
        checkingDate = new Date(Date.now() - 86400000);
      }

      while (true) {
        const dStr = checkingDate.toISOString().slice(0, 10);
        if (distinctDays.has(dStr)) {
          currentStreak++;
          checkingDate.setDate(checkingDate.getDate() - 1);
        } else {
          break;
        }
      }

      let prevDate = null;
      for (const dStr of Array.from(distinctDays).sort()) {
        const curDate = new Date(dStr);
        if (prevDate) {
          const diffDays = Math.round((curDate - prevDate) / (86400000));
          if (diffDays === 1) {
            tempStreak++;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        prevDate = curDate;
      }
    }

    // 5. Goal completion progress
    const goals = await Goal.find({ userId }).lean();
    const totalGoals = goals.length;
    let totalMilestones = 0;
    let completedMilestones = 0;
    goals.forEach(g => {
      (g.milestones || []).forEach(m => {
        totalMilestones++;
        if (m.done) completedMilestones++;
      });
    });
    const avgGoalProgress = totalGoals > 0
      ? Math.round(goals.reduce((acc, g) => acc + (g.progress || 0), 0) / totalGoals)
      : 0;

    // 6. Community most-shared skills
    const usersWithSkills = await User.find().select('skillsOffered skillsWanted').lean();
    const skillShareCounts = {};
    usersWithSkills.forEach(u => {
      (u.skillsOffered || []).forEach(s => {
        const k = s.name.trim();
        skillShareCounts[k] = (skillShareCounts[k] || 0) + 1;
      });
    });
    const topCommunitySkills = Object.entries(skillShareCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // 7. Trust metrics
    const trust = await calculateUserTrustMetrics(userId);

    res.json({
      success: true,
      analytics: {
        totalCompletedSessions: totalSessions,
        totalLearningHours: totalHours,
        taughtCount,
        learnedCount,
        currentStreakDays: currentStreak,
        longestStreakDays: longestStreak,
        activeLearningDaysCount: distinctDays.size,
        distinctDays: Array.from(distinctDays).slice(0, 30),
        weeklyActivity,
        goalStats: {
          totalGoals,
          avgProgress: avgGoalProgress,
          totalMilestones,
          completedMilestones
        },
        topCommunitySkills,
        trustScore: trust.trustScore,
        trustTier: trust.trustTier
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to aggregate analytics.' });
  }
});

// Goals Endpoints
router.get('/goals', requireAuth, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, goals });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to retrieve goals.' });
  }
});

router.post('/goals', requireAuth, async (req, res) => {
  try {
    const { title, skill, targetDate, progress, milestones } = req.body;
    if (!title || !skill) {
      return res.status(400).json({ success: false, error: 'Goal title and skill are required.' });
    }

    const goal = await Goal.create({
      userId: req.user._id,
      title: sanitizeText(title),
      skill: sanitizeText(skill),
      targetDate: targetDate ? new Date(targetDate) : null,
      progress: Math.min(100, Math.max(0, Number(progress) || 0)),
      milestones: Array.isArray(milestones) ? milestones.map(m => ({ text: sanitizeText(m.text || m.title || String(m)), done: !!(m.done || m.completed) })) : []
    });

    res.status(201).json({ success: true, goal });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create goal.' });
  }
});

router.patch('/goals/:id', requireAuth, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, userId: req.user._id });
    if (!goal) {
      return res.status(404).json({ success: false, error: 'Goal not found.' });
    }
    const { title, skill, progress, milestones, targetDate } = req.body;
    if (title) goal.title = sanitizeText(title);
    if (skill) goal.skill = sanitizeText(skill);
    if (progress !== undefined) goal.progress = Math.min(100, Math.max(0, Number(progress)));
    if (targetDate !== undefined) goal.targetDate = targetDate ? new Date(targetDate) : null;
    if (Array.isArray(milestones)) {
      goal.milestones = milestones.map(m => ({ text: sanitizeText(m.text || m), done: !!m.done }));
    }
    goal.updatedAt = new Date();
    await goal.save();

    res.json({ success: true, goal });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update goal.' });
  }
});

router.delete('/goals/:id', requireAuth, async (req, res) => {
  try {
    await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true, message: 'Goal removed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete goal.' });
  }
});

// Activity Ledger Endpoints
router.get('/activities', requireAuth, async (req, res) => {
  try {
    const activities = await Activity.find({ userId: req.user._id }).sort({ date: -1 }).limit(50);
    res.json({ success: true, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to retrieve activity log.' });
  }
});

router.post('/activities', requireAuth, async (req, res) => {
  try {
    const { type, skill, partner, minutes, date, rating, notes } = req.body;
    if (!skill) {
      return res.status(400).json({ success: false, error: 'Skill name is required.' });
    }

    const activity = await Activity.create({
      userId: req.user._id,
      type: ['taught', 'learned', 'practiced'].includes(type) ? type : 'learned',
      skill: sanitizeText(skill),
      partner: sanitizeText(partner || ''),
      minutes: Number(minutes) || 60,
      date: date ? new Date(date) : new Date(),
      rating: Number(rating) || 5,
      notes: sanitizeText(notes || '')
    });

    res.status(201).json({ success: true, activity });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to record activity.' });
  }
});

module.exports = router;
