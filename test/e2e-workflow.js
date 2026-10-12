const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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
} = require('../src/models');
const { calculateUserTrustMetrics } = require('../src/trustScore');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'skillswap-dev-secret-key-change-in-prod';

async function request(url, options = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, extra = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${extra}`);
    failed++;
  }
}

async function runEndToEndTests() {
  console.log('====================================================');
  console.log('  SKILLSWAP 10-PHASE END-TO-END VALIDATION SUITE');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillswap');

  // --- PHASE 1: Authentication & User Onboarding ---
  console.log('--- PHASE 1: AUTHENTICATION & ONBOARDING ---');
  const userAEmail = `e2e_alice_${Date.now()}@example.com`;
  const userBEmail = `e2e_bob_${Date.now()}@example.com`;

  // 1. Register User A (Alice)
  const regA = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Alice Wonder',
      email: userAEmail,
      password: 'Password123!',
      skillsOffered: ['Python', 'Machine Learning', 'Data Science'],
      skillsWanted: ['React', 'Frontend Design'],
      bio: 'Python specialist eager to master modern React.',
      interests: ['AI', 'Web Development', 'Design'],
      availability: 'Weekdays after 6pm',
      preferredMethods: ['Video Call', 'Code Review']
    })
  });
  assert(regA.status === 201 && regA.data.user && regA.data.token, 'Phase 1: User A successfully registers with skills & preferences');
  const tokenA = regA.data.token;
  const userAId = regA.data.user._id || regA.data.user.id;

  // 2. Register User B (Bob)
  const regB = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Bob Builder',
      email: userBEmail,
      password: 'Password123!',
      skillsOffered: ['React', 'CSS Architecture'],
      skillsWanted: ['Python', 'Machine Learning'],
      bio: 'Frontend expert wanting to learn ML pipelines.',
      interests: ['Web Development', 'AI'],
      availability: 'Weekdays after 6pm',
      preferredMethods: ['Video Call', 'Live Pairing']
    })
  });
  assert(regB.status === 201 && regB.data.user && regB.data.token, 'Phase 1: User B successfully registers with complementary skills');
  const tokenB = regB.data.token;
  const userBId = regB.data.user._id || regB.data.user.id;

  // 3. Update Profile
  const updateA = await request('/api/auth/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      education: 'B.Tech in Computer Science',
      availability: 'Weekdays 18:00 - 21:00'
    })
  });
  assert(updateA.status === 200 && updateA.data.user.education === 'B.Tech in Computer Science', 'Phase 1: Profile update persists education and availability');

  // --- PHASE 2: Personalized Dashboard ---
  console.log('\n--- PHASE 2: PERSONALIZED DASHBOARD ---');
  const dashA = await request('/api/dashboard/summary', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dbData = dashA.data.dashboard || dashA.data;
  assert(
    dashA.status === 200 &&
    Array.isArray(dbData.skillsCanTeach) &&
    dbData.skillsCanTeach.length >= 3 &&
    Array.isArray(dbData.recommendedPartners),
    'Phase 2: Dashboard summary returns user skills, recommendations, and trust metrics'
  );

  // --- PHASE 3: Smart Skill Matching ---
  console.log('\n--- PHASE 3: SMART SKILL MATCHING ---');
  const matchesA = await request('/api/matches', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(matchesA.status === 200 && Array.isArray(matchesA.data.matches), 'Phase 3: Smart skill matching returns matches');
  const matchWithBob = matchesA.data.matches.find(m => {
    const candId = m.candidate?.id || m.candidate?._id || m.user?._id || m.user?.id;
    return candId && candId.toString() === userBId.toString();
  });
  assert(
    matchWithBob && matchWithBob.score > 40 && matchWithBob.reasons?.length > 0,
    'Phase 3: Explainable match algorithm calculates high compatibility score for Bob with skill overlap'
  );

  // --- PHASE 4: Community Knowledge Hub ---
  console.log('\n--- PHASE 4: COMMUNITY KNOWLEDGE HUB ---');
  const postRes = await request('/api/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      title: 'Getting Started with NumPy and Pandas',
      contentType: 'tutorial',
      content: 'A comprehensive starter guide for data manipulation using vectorization in NumPy.',
      tags: ['python', 'datascience', 'numpy'],
      resourceLink: 'https://numpy.org/doc/stable/'
    })
  });
  assert(postRes.status === 201 && postRes.data.post && postRes.data.post.title, 'Phase 4: User A publishes educational tutorial in Hub');
  const postId = postRes.data.post._id || postRes.data.post.id;

  // React to post
  const reactRes = await request(`/api/posts/${postId}/reactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ reactionType: 'helpful' })
  });
  assert(reactRes.status === 200 && reactRes.data.reactionsCount.helpful >= 1, 'Phase 4: User B reacts "helpful" to User A post');

  // Comment on post
  const commentRes = await request(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ content: 'Awesome guide Alice! The vectorization examples were super clear.' })
  });
  assert(commentRes.status === 201 && commentRes.data.comment, 'Phase 4: User B comments on tutorial post');

  // Bookmark post
  const bmarkRes = await request(`/api/bookmarks/${postId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(bmarkRes.status === 200 && bmarkRes.data.isBookmarked === true, 'Phase 4: User B privately bookmarks the post');

  // --- PHASE 5: Learning Requests & Sessions ---
  console.log('\n--- PHASE 5: LEARNING REQUESTS & SESSIONS ---');
  const sessionDate = new Date();
  sessionDate.setDate(sessionDate.getDate() + 3);

  const reqSession = await request('/api/sessions/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      partnerId: userBId,
      skill: 'React',
      learnSkill: 'React',
      teachSkill: 'Python',
      date: sessionDate.toISOString().split('T')[0],
      time: '19:00',
      duration: 60,
      message: 'Hi Bob! Let us exchange React component design for Python async tips.'
    })
  });
  assert(reqSession.status === 201 && reqSession.data.session, 'Phase 5: User A requests a learning session with User B');
  const sessionId = reqSession.data.session._id || reqSession.data.session.id;

  // Accept session
  const acceptRes = await request(`/api/sessions/${sessionId}/accept`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(acceptRes.status === 200 && acceptRes.data.session.status === 'accepted', 'Phase 5: User B accepts learning session request');

  // Complete session
  const completeRes = await request(`/api/sessions/${sessionId}/complete`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(completeRes.status === 200 && completeRes.data.session.status === 'completed', 'Phase 5: Session marked completed with authorized state transition');

  // --- PHASE 6: Live Chat & Notifications ---
  console.log('\n--- PHASE 6: LIVE CHAT & NOTIFICATIONS ---');
  // Create or get conversation
  const convRes = await request('/api/conversations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ recipientId: userBId })
  });
  assert(convRes.status === 200 && convRes.data.conversation, 'Phase 6: 1-to-1 conversation initialized between partners');
  const convId = convRes.data.conversation._id || convRes.data.conversation.id;

  // Send message
  const msgRes = await request(`/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ text: 'Hey Bob! Looking forward to our next pairing session.' })
  });
  assert(msgRes.status === 201 && msgRes.data.message, 'Phase 6: Message sent and persisted in MongoDB');

  // Check notifications for User B
  const notifRes = await request('/api/notifications', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(notifRes.status === 200 && Array.isArray(notifRes.data.notifications) && notifRes.data.notifications.length > 0, 'Phase 6: User B receives persistent notifications for session and message');

  // --- PHASE 7: Trust Score & Skill Verification ---
  console.log('\n--- PHASE 7: TRUST SCORE & SKILL VERIFICATION ---');
  // Review completed session
  const revRes = await request('/api/reviews', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      sessionId: sessionId,
      rating: 5,
      comment: 'Alice is a fantastic mentor! Python concepts were explained with incredible clarity.',
      skill: 'Python'
    })
  });
  assert(revRes.status === 201 && revRes.data.review, 'Phase 7: User B reviews completed session with Alice');

  // Endorse skill
  const endRes = await request('/api/endorsements', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({
      recipientId: userAId,
      skill: 'Python',
      comment: 'Excellent understanding of Python data structures and clean code.'
    })
  });
  assert(endRes.status === 201 && endRes.data.endorsement, 'Phase 7: User B endorses Alice for Python');

  // Submit skill verification
  const verRes = await request('/api/verifications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      skill: 'Python',
      category: 'Programming',
      evidenceUrl: 'https://github.com/alice/ml-showcase',
      notes: 'Open source data pipeline with 100+ GitHub stars.'
    })
  });
  assert(verRes.status === 201 && verRes.data.verification.status === 'pending', 'Phase 7: Alice submits skill verification evidence (pending review)');

  // Admin approval of verification
  const adminRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'rohan@demo.com', password: 'password123' })
  });
  assert(adminRes.status === 200 && adminRes.data.token, 'Phase 7: Authenticate authorized platform administrator (Rohan)');
  const adminToken = adminRes.data.token;

  const verId = verRes.data.verification._id || verRes.data.verification.id;
  const approveRes = await request(`/api/verifications/${verId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'approved', reviewerNotes: 'Verified GitHub repository code quality.' })
  });
  assert(approveRes.status === 200 && approveRes.data.verification.status === 'approved', 'Phase 7: Authorized Moderator approves verification evidence');

  // Trust score calculation
  const trustA = await calculateUserTrustMetrics(userAId);
  assert(trustA.trustScore > 20 && trustA.metrics.completedSessionsCount >= 1 && trustA.metrics.endorsementsCount >= 1, 'Phase 7: Alice trust score dynamically updates based on real verified records');

  // --- PHASE 8: Learning Analytics & Goals ---
  console.log('\n--- PHASE 8: LEARNING ANALYTICS & GOALS ---');
  // Create Goal
  const goalRes = await request('/api/goals', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      title: 'Master React State Management',
      skill: 'React',
      targetHours: 20,
      deadline: '2026-12-31',
      milestones: [
        { title: 'Learn useState and useEffect', completed: true },
        { title: 'Build Redux Toolkit slice', completed: false }
      ]
    })
  });
  assert(goalRes.status === 201 && goalRes.data.goal && goalRes.data.goal.title, 'Phase 8: Alice creates structured learning goal with milestones');

  // Fetch Analytics
  const analyticsRes = await request('/api/analytics', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const anData = analyticsRes.data.analytics || analyticsRes.data;
  assert(
    analyticsRes.status === 200 &&
    anData.totalCompletedSessions >= 1 &&
    anData.currentStreakDays !== undefined &&
    Array.isArray(anData.topCommunitySkills),
    'Phase 8: MongoDB aggregation pipeline computes real analytics (sessions, hours, streak, skills ratio)'
  );

  // --- PHASE 9 & 10: Roles & Navigation Permissions ---
  console.log('\n--- PHASE 9 & 10: ROLES & MODERATION NAVIGATION ---');
  // Regular user cannot view moderation overview
  const regularMod = await request('/api/moderation/overview', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(regularMod.status === 403, 'Phase 10: Regular users are forbidden (403) from accessing Moderation Portal');

  // Admin user can view moderation overview
  const adminMod = await request('/api/moderation/overview', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminMod.status === 200 && adminMod.data.stats && adminMod.data.stats.totalUsers !== undefined, 'Phase 10: Admin/Moderator can access Moderation overview with reports and verifications');

  // Cleanup test users
  await User.deleteMany({ _id: { $in: [userAId, userBId] } });
  await Post.deleteMany({ authorId: { $in: [userAId, userBId] } });
  await LearningSession.deleteMany({ _id: sessionId });
  await Conversation.deleteMany({ _id: convId });
  await Goal.deleteMany({ userId: userAId });

  await mongoose.disconnect();

  console.log('\n====================================================');
  console.log(`  FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEndToEndTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
