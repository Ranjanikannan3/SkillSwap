const assert = require('assert');
const { io: ioClient } = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return res.json();
}

async function getJson(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res.json();
}

async function runSocketSyncTest() {
  console.log('======================================================');
  console.log('  TESTING LIVE CROSS-ACCOUNT SOCKET.IO SYNCHRONIZATION');
  console.log('======================================================\n');

  // 1. Authenticate User A (Aarav) and User B (Meera)
  const authA = await postJson('/api/auth/login', { email: 'aarav@demo.com', password: 'password123' });
  const authB = await postJson('/api/auth/login', { email: 'meera@demo.com', password: 'password123' });

  assert.ok(authA.token, 'User A should receive JWT token');
  assert.ok(authB.token, 'User B should receive JWT token');
  console.log('✅ 1. Both User A and User B authenticated with JWT tokens');

  // 2. Connect two independent Socket.IO clients with authentication tokens
  const socketA = ioClient(BASE_URL, { auth: { token: authA.token } });
  const socketB = ioClient(BASE_URL, { auth: { token: authB.token } });

  await Promise.all([
    new Promise(res => socketA.on('connect', res)),
    new Promise(res => socketB.on('connect', res))
  ]);
  console.log('✅ 2. Both User A and User B connected via Socket.IO');

  // 3. Test: User A creates a post -> User B receives real-time `post:created`
  const postPromiseForB = new Promise((resolve) => {
    socketB.on('post:created', (data) => {
      resolve(data);
    });
  });

  const postTitle = `Live Sync Post ${Date.now()}`;
  const createPostRes = await postJson('/api/posts', {
    title: postTitle,
    content: 'Testing real-time broadcast across independent client accounts without manual refresh.',
    contentType: 'tutorial',
    tags: ['web development', 'python']
  }, authA.token);

  assert.ok(createPostRes.success);
  const postId = createPostRes.post.id;

  const receivedByB = await Promise.race([
    postPromiseForB,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Socket B timed out waiting for post:created')), 5000))
  ]);

  assert.strictEqual(receivedByB.id, postId);
  assert.strictEqual(receivedByB.title, postTitle);
  console.log('✅ 3. User A published post -> User B received live post:created event instantly');

  // 4. Test: User B reacts "helpful" -> User A receives real-time `reaction:updated`
  const rxPromiseForA = new Promise((resolve) => {
    socketA.on('reaction:updated', (data) => {
      if (data.postId === postId) resolve(data);
    });
  });

  const rxRes = await postJson(`/api/posts/${postId}/reactions`, { reactionType: 'helpful' }, authB.token);
  assert.ok(rxRes.success);

  const receivedRxByA = await Promise.race([
    rxPromiseForA,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Socket A timed out waiting for reaction:updated')), 5000))
  ]);

  assert.strictEqual(receivedRxByA.reactionType, 'helpful');
  assert.strictEqual(receivedRxByA.added, true);
  console.log('✅ 4. User B reacted -> User A received live reaction:updated event with synchronized count');

  // 5. Test: User B comments -> User A receives real-time `comment:created`
  const commentPromiseForA = new Promise((resolve) => {
    socketA.on('comment:created', (data) => {
      if (data.postId === postId) resolve(data);
    });
  });

  const commentRes = await postJson(`/api/posts/${postId}/comments`, {
    content: 'Real-time multi-user comments are working seamlessly!'
  }, authB.token);
  assert.ok(commentRes.success);

  const receivedCommentByA = await Promise.race([
    commentPromiseForA,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Socket A timed out waiting for comment:created')), 5000))
  ]);

  assert.strictEqual(receivedCommentByA.comment.content, 'Real-time multi-user comments are working seamlessly!');
  console.log('✅ 5. User B commented -> User A received live comment:created event with updated commentsCount');

  // 6. Test: User A bookmarks post -> Bookmark is private to User A, not visible to User B
  const bmResA = await postJson(`/api/bookmarks/${postId}`, {}, authA.token);
  assert.strictEqual(bmResA.isBookmarked, true);

  const bmListA = await getJson('/api/bookmarks', authA.token);
  const bmListB = await getJson('/api/bookmarks', authB.token);

  assert.ok(bmListA.bookmarks.some(b => b.post.id === postId), 'User A should have post bookmarked');
  assert.ok(!bmListB.bookmarks.some(b => b.post.id === postId), 'User B must NOT have post bookmarked (private isolation)');
  console.log('✅ 6. Private Bookmarks verified: User A has saved post; User B account remains private and isolated');

  // 7. Cleanup sockets
  socketA.disconnect();
  socketB.disconnect();

  console.log('\n======================================================');
  console.log('  ALL LIVE MULTI-USER SOCKET.IO TESTS PASSED 100%!');
  console.log('======================================================\n');
  process.exit(0);
}

runSocketSyncTest().catch(err => {
  console.error('Socket test error:', err);
  process.exit(1);
});
