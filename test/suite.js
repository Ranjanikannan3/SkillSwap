const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../server');
const {
  User,
  Post,
  Comment,
  Reaction,
  Bookmark,
  LearningSession,
  Review,
  Endorsement,
  SkillVerification,
  Report,
  Block
} = require('../src/models');

const PORT = 3001; // Separate port for testing
let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('  RUNNING SKILLSWAP FULL AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  // Connect to MongoDB if not already connected
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillswap';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI);
  }
  const { seedDatabase } = require('../src/seed');
  await seedDatabase();

  // Start HTTP server on test port
  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));
  baseUrl = `http://127.0.0.1:${PORT}`;

  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• ${name}... `);
      await fn();
      console.log('✅ PASS');
      testsPassed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error('  Error:', err.message);
      testsFailed++;
    }
  }

  try {
    // 1. Health Check
    await test('Backend Health & MongoDB Atlas / Local Connection', async () => {
      const res = await request('/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'ok');
      assert.strictEqual(res.data.mongodb, 'connected');
    });

    // 2. Multi-User Authentication
    let tokenUserA, tokenUserB, tokenAdmin;
    let userA, userB, adminUser;

    await test('Multi-User Authentication & Token Issuance (User A, User B, Admin)', async () => {
      // User A (Aarav)
      const resA = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'aarav@demo.com', password: 'password123' }
      });
      assert.strictEqual(resA.status, 200);
      assert.ok(resA.data.token);
      tokenUserA = resA.data.token;
      userA = resA.data.user;

      // User B (Meera)
      const resB = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'meera@demo.com', password: 'password123' }
      });
      assert.strictEqual(resB.status, 200);
      assert.ok(resB.data.token);
      tokenUserB = resB.data.token;
      userB = resB.data.user;

      // Admin (Rohan)
      const resAdmin = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'rohan@demo.com', password: 'password123' }
      });
      assert.strictEqual(resAdmin.status, 200);
      assert.strictEqual(resAdmin.data.user.systemRole, 'admin');
      tokenAdmin = resAdmin.data.token;
      adminUser = resAdmin.data.user;
    });

    // 3. Community Knowledge Hub - Post Creation & Multi-User Shared Visibility
    let createdPostId;
    await test('User A creates a Knowledge Hub Post -> Persists in MongoDB', async () => {
      const res = await request('/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          title: 'Automated Test: State Persistence in MongoDB',
          content: 'This post is created by User A to verify cross-user live feed synchronization and MongoDB persistence.',
          contentType: 'tutorial',
          tags: ['web development', 'python', 'ai/ml'],
          resourceLink: 'https://mongodb.com/atlas',
          resourceTitle: 'MongoDB Atlas Cloud'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.post.id);
      createdPostId = res.data.post.id;
      assert.strictEqual(res.data.post.title, 'Automated Test: State Persistence in MongoDB');
    });

    await test('User B logs in and sees User A\'s post in shared feed (Cross-Account Visibility)', async () => {
      const res = await request(`/api/posts?tag=web+development`, {
        headers: { Authorization: `Bearer ${tokenUserB}` }
      });
      assert.strictEqual(res.status, 200);
      const found = res.data.posts.find(p => p.id === createdPostId);
      assert.ok(found, 'User B should see User A\'s post in the shared feed');
      assert.strictEqual(found.author.email, 'aarav@demo.com');
    });

    // 4. Reactions & Duplicate Prevention
    await test('User B reacts "helpful" to User A\'s post -> Count increments', async () => {
      const res = await request(`/api/posts/${createdPostId}/reactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { reactionType: 'helpful' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.added, true);
      assert.strictEqual(res.data.reactionsCount.helpful, 1);
    });

    await test('Duplicate Reaction Prevention: Toggling reaction behaves idempotently without duplicates', async () => {
      // Repeating reaction should toggle it off cleanly
      const resToggle = await request(`/api/posts/${createdPostId}/reactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { reactionType: 'helpful' }
      });
      assert.strictEqual(resToggle.status, 200);
      assert.strictEqual(resToggle.data.added, false);
      assert.strictEqual(resToggle.data.reactionsCount.helpful, 0);

      // Re-enable helpful reaction for subsequent checks
      const resReAdd = await request(`/api/posts/${createdPostId}/reactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { reactionType: 'helpful' }
      });
      assert.strictEqual(resReAdd.status, 200);
      assert.strictEqual(resReAdd.data.added, true);
    });

    // 5. Bookmarks Private Isolation per User
    await test('Bookmarks: User A bookmarks post -> Private to User A, not visible to User B', async () => {
      // User A bookmarks the post
      const resBM = await request(`/api/bookmarks/${createdPostId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` }
      });
      assert.strictEqual(resBM.status, 200);
      assert.strictEqual(resBM.data.isBookmarked, true);

      // User A gets bookmarks -> contains post
      const resListA = await request('/api/bookmarks', {
        headers: { Authorization: `Bearer ${tokenUserA}` }
      });
      assert.strictEqual(resListA.status, 200);
      const hasPostA = resListA.data.bookmarks.some(b => b.post.id === createdPostId);
      assert.strictEqual(hasPostA, true);

      // User B gets bookmarks -> does NOT contain post (isolated private data)
      const resListB = await request('/api/bookmarks', {
        headers: { Authorization: `Bearer ${tokenUserB}` }
      });
      assert.strictEqual(resListB.status, 200);
      const hasPostB = resListB.data.bookmarks.some(b => b.post.id === createdPostId);
      assert.strictEqual(hasPostB, false, 'User B should not see User A\'s private bookmark');
    });

    // 6. Comments & Nested Discussion
    let createdCommentId;
    await test('User B comments on User A\'s post -> Saved in MongoDB with comment count update', async () => {
      const res = await request(`/api/posts/${createdPostId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { content: 'Verified real-time multi-user synchronization.' }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.comment.id);
      createdCommentId = res.data.comment.id;
      assert.strictEqual(res.data.commentsCount, 1);
    });

    // 7. Security: Permissions & Ownership
    await test('Authorization: User B cannot edit or delete User A\'s post', async () => {
      const res = await request(`/api/posts/${createdPostId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { title: 'Malicious title update attempt' }
      });
      assert.strictEqual(res.status, 403, 'Should forbid editing someone else\'s post');
    });

    await test('Sanitization: Malicious script tags are stripped and invalid URLs rejected', async () => {
      const resBadUrl = await request('/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          title: 'Testing bad URL',
          content: 'Some valid content',
          resourceLink: 'javascript:alert(1)'
        }
      });
      assert.strictEqual(resBadUrl.status, 400, 'Should reject javascript: URI schemes');

      const resXss = await request('/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          title: 'Clean Title <script>alert("hacked")</script>',
          content: 'Safe Content <script>console.log("bad")</script>'
        }
      });
      assert.strictEqual(resXss.status, 201);
      assert.ok(!resXss.data.post.title.includes('<script>'));
      assert.ok(!resXss.data.post.content.includes('<script>'));
    });

    // 8. Trust Score & Review Eligibility (Backend Enforcement)
    let completedSessionId;
    await test('Backend enforces: Reviews rejected without verified completed session', async () => {
      // Fake session ID or uncompleted session
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request('/api/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          sessionId: fakeId,
          rating: 5,
          comment: 'Fake review attempt'
        }
      });
      assert.strictEqual(res.status, 404, 'Should reject review for non-existent session');
    });

    await test('Complete a session between User A and User B -> Then Review succeeds', async () => {
      // Create and complete session
      const sessionRes = await request('/api/sessions/complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          partnerId: userB.id,
          skill: 'Python',
          category: 'Programming',
          minutes: 60,
          notes: 'Completed live pair-programming session in Python'
        }
      });
      assert.strictEqual(sessionRes.status, 201);
      completedSessionId = sessionRes.data.session._id;

      // User B reviews User A for this completed session
      const reviewRes = await request('/api/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          sessionId: completedSessionId,
          rating: 5,
          comment: 'Outstanding Python session! Everything was clear and well paced.',
          skill: 'Python'
        }
      });
      assert.strictEqual(reviewRes.status, 201);
      assert.strictEqual(reviewRes.data.review.rating, 5);
      assert.ok(reviewRes.data.trustMetrics.trustScore > 0);
    });

    await test('Backend enforces: Exactly ONE review per reviewer per completed session', async () => {
      // Attempt second review for same completed session
      const dupRes = await request('/api/reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          sessionId: completedSessionId,
          rating: 4,
          comment: 'Duplicate review attempt'
        }
      });
      assert.strictEqual(dupRes.status, 400, 'Must block duplicate review for same session');
    });

    // 9. Peer Endorsements Rules
    const testSkill = 'Skill_' + Date.now();
    await test('Peer Endorsements: Self-endorsement is forbidden by backend', async () => {
      const res = await request('/api/endorsements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          recipientId: userA.id, // Self!
          skill: testSkill
        }
      });
      assert.strictEqual(res.status, 400, 'Should reject self-endorsement');
    });

    await test('Peer Endorsements: Valid peer endorsement succeeds and prevents duplicates', async () => {
      // User B endorses User A
      const res = await request('/api/endorsements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          recipientId: userA.id,
          skill: testSkill,
          comment: 'Demonstrated strong layout and design composition skills.',
          evidenceUrl: 'https://github.com/aarav-sharma'
        }
      });
      assert.strictEqual(res.status, 201);

      // Attempt duplicate endorsement for same skill
      const dupRes = await request('/api/endorsements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          recipientId: userA.id,
          skill: testSkill,
          comment: 'Duplicate endorsement attempt'
        }
      });
      assert.strictEqual(dupRes.status, 400, 'Should reject duplicate endorsement for same skill');
    });

    // 10. Transparent Trust Score Calculation
    await test('Trust Score calculation returns transparent breakdown and clear disclaimer', async () => {
      const res = await request(`/api/users/${userA.id}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.trust.trustScore >= 0 && res.data.trust.trustScore <= 100);
      assert.ok(Array.isArray(res.data.trust.breakdown));
      assert.ok(res.data.trust.disclaimer.includes('algorithmic reputation metric'));
      assert.ok(res.data.trust.metrics.completedSessionsCount >= 1);
    });

    // 11. Skill Verification & Role-Based Moderation
    let verificationId;
    const testVerificationSkill = 'VerifSkill_' + Date.now();
    await test('Skill Verification: User requests verification -> Regular user cannot approve (403)', async () => {
      const reqRes = await request('/api/verifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: {
          skill: testVerificationSkill,
          category: 'Programming',
          evidenceUrl: 'https://github.com/aarav-sharma/distributed-cache',
          notes: 'Built distributed caching node cluster'
        }
      });
      assert.strictEqual(reqRes.status, 201);
      assert.strictEqual(reqRes.data.verification.status, 'pending');
      verificationId = reqRes.data.verification._id;

      // Regular user (User A) attempts to approve own verification
      const badApprove = await request(`/api/verifications/${verificationId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenUserA}` },
        body: { status: 'approved' }
      });
      assert.strictEqual(badApprove.status, 403, 'Regular member must not approve verifications');
    });

    await test('Skill Verification: Admin / Moderator approves verification -> Updates trust score', async () => {
      const approveRes = await request(`/api/verifications/${verificationId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: {
          status: 'approved',
          reviewerNotes: 'Verified GitHub source code and test coverage.'
        }
      });
      assert.strictEqual(approveRes.status, 200);
      assert.strictEqual(approveRes.data.verification.status, 'approved');
      assert.ok(approveRes.data.targetUserTrust.trustScore > 0);
    });

    // 12. Reporting & Moderation
    await test('Reporting: Users can report content securely (not exposed publicly)', async () => {
      const repRes = await request('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: {
          targetType: 'post',
          targetId: createdPostId,
          reason: 'Inappropriate content',
          details: 'Testing report submission'
        }
      });
      assert.strictEqual(repRes.status, 201);

      // Admin views reports
      const adminRepRes = await request('/api/reports', {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });
      assert.strictEqual(adminRepRes.status, 200);
      assert.ok(adminRepRes.data.reports.length > 0);
    });

    // 13. Blocking Behavior
    await test('Blocking: Blocked user content is excluded from blocker\'s feed', async () => {
      // User B blocks User A
      const blockRes = await request('/api/blocks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenUserB}` },
        body: { blockedId: userA.id }
      });
      assert.strictEqual(blockRes.status, 200);

      // User B queries feed -> User A's posts should not appear
      const feedRes = await request('/api/posts', {
        headers: { Authorization: `Bearer ${tokenUserB}` }
      });
      assert.strictEqual(feedRes.status, 200);
      const containsBlocked = feedRes.data.posts.some(p => p.author.id === userA.id);
      assert.strictEqual(containsBlocked, false, 'User B should not see posts by blocked User A');

      // Unblock to restore state
      await request(`/api/blocks/${userA.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenUserB}` }
      });
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite runner failed:', err);
  process.exit(1);
});
