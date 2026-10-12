'use strict';
/* =====================================================================
   SkillSwap - Community Knowledge Hub & Trust Score Verification Module
   Powered by MongoDB Atlas & Socket.IO Real-Time Synchronization
   ===================================================================== */

const HubState = {
  token: null,
  socket: null,
  posts: [],
  totalPosts: 0,
  currentPage: 1,
  currentTag: '',
  currentType: '',
  searchQuery: '',
  currentSort: 'newest',
  isLoading: false,
  myTrustData: null,
  completedSessions: [],
  allUsers: []
};

/* ----------------------------- API CLIENT ---------------------------- */
function getAuthToken() {
  if (!HubState.token) {
    HubState.token = localStorage.getItem('skillswap_token');
  }
  return HubState.token;
}

function setAuthToken(token) {
  HubState.token = token;
  if (token) {
    localStorage.setItem('skillswap_token', token);
  } else {
    localStorage.removeItem('skillswap_token');
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || `Request failed with status ${res.status}`;
      return { success: false, error: errMsg, status: res.status };
    }
    return data;
  } catch (err) {
    console.error('API call error:', path, err);
    return { success: false, error: 'Network error. Please verify backend server is running.' };
  }
}

/* ------------------------- SOCKET.IO LIVE SYNC ----------------------- */
function initHubSocket() {
  if (typeof io === 'undefined') {
    console.warn('[Socket.IO] Library not loaded. Falling back to HTTP polling.');
    return;
  }

  if (HubState.socket) {
    HubState.socket.disconnect();
  }

  const token = getAuthToken();
  HubState.socket = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  HubState.socket.on('connect', () => {
    updateSyncIndicator(true);
  });

  HubState.socket.on('disconnect', () => {
    updateSyncIndicator(false);
  });

  // 1. Post Events
  HubState.socket.on('post:created', (newPost) => {
    // If on community view, prepend post if matches current filters
    const isTagMatch = !HubState.currentTag || (newPost.tags || []).includes(HubState.currentTag.toLowerCase());
    const isTypeMatch = !HubState.currentType || newPost.contentType === HubState.currentType;

    if (isTagMatch && isTypeMatch) {
      HubState.posts.unshift(newPost);
      if (location.hash === '#community') {
        renderHubFeed();
      }
    }
    if (me && newPost.author.id !== me.mongoId && newPost.author.email !== me.email) {
      toast(`New Post by ${newPost.author.name}: "${newPost.title.slice(0, 35)}..."`, 'ok');
    }
  });

  HubState.socket.on('post:updated', (updated) => {
    const ix = HubState.posts.findIndex(p => p.id === updated.id);
    if (ix >= 0) {
      HubState.posts[ix] = { ...HubState.posts[ix], ...updated };
      if (location.hash === '#community') {
        renderHubFeed();
      }
    }
  });

  HubState.socket.on('post:deleted', ({ id }) => {
    HubState.posts = HubState.posts.filter(p => p.id !== id);
    if (location.hash === '#community') {
      renderHubFeed();
    }
  });

  // 2. Reaction Events
  HubState.socket.on('reaction:updated', ({ postId, reactionType, reactionsCount, userId, added }) => {
    const post = HubState.posts.find(p => p.id === postId);
    if (post) {
      post.reactionsCount = reactionsCount;
      if (me && (me.mongoId === userId || me.id === userId)) {
        post.userReacted = post.userReacted || {};
        post.userReacted[reactionType] = added;
      }
      updatePostReactionDOM(postId, reactionsCount, reactionType, added, userId);
    }
  });

  // 3. Comment Events
  HubState.socket.on('comment:created', ({ postId, comment, commentsCount }) => {
    const post = HubState.posts.find(p => p.id === postId);
    if (post) {
      post.commentsCount = commentsCount;
      updatePostCommentBadgeDOM(postId, commentsCount);
    }
    const container = document.getElementById(`comments-list-${postId}`);
    if (container) {
      appendCommentToDOM(container, comment);
    }
  });

  HubState.socket.on('comment:deleted', ({ postId, commentId, commentsCount }) => {
    const post = HubState.posts.find(p => p.id === postId);
    if (post) {
      post.commentsCount = commentsCount;
      updatePostCommentBadgeDOM(postId, commentsCount);
    }
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) commentEl.remove();
  });

  // 4. Trust, Review & Endorsement Events
  HubState.socket.on('review:created', ({ review, revieweeTrust }) => {
    if (me && (review.revieweeId === me.mongoId || review.revieweeId === me.id)) {
      HubState.myTrustData = revieweeTrust;
      toast(`⭐ New peer review received from ${review.reviewer.name}! (+Trust Score)`, 'gold');
      if (location.hash === '#trust') render();
    }
  });

  HubState.socket.on('endorsement:created', ({ endorsement, recipientTrust }) => {
    if (me && (endorsement.recipientId === me.mongoId || endorsement.recipientId === me.id)) {
      HubState.myTrustData = recipientTrust;
      toast(`🛡️ ${endorsement.endorser.name} endorsed you for "${endorsement.skill}"!`, 'gold');
      if (location.hash === '#trust') render();
    }
  });

  HubState.socket.on('verification:resolved', ({ id, userId, status, skill, targetUserTrust }) => {
    if (me && (userId === me.mongoId || userId === me.id)) {
      HubState.myTrustData = targetUserTrust;
      if (status === 'approved') {
        toast(`🎉 Your verification for "${skill}" was APPROVED! (+15 Trust Points)`, 'ok');
        if (typeof triggerConfetti === 'function') triggerConfetti();
      } else {
        toast(`Your verification for "${skill}" was rejected by moderators.`, 'err');
      }
      if (location.hash === '#trust') render();
    }
    if (location.hash === '#moderation') {
      render();
    }
  });

  HubState.socket.on('session:completed', () => {
    if (location.hash === '#trust') {
      loadTrustViewData();
    }
  });
}

function updateSyncIndicator(isConnected) {
  const ind = document.getElementById('storageIndicator');
  if (ind) {
    ind.innerHTML = `
      <span class="status-dot ${isConnected ? 'pulse' : ''}" style="background:${isConnected ? '#10b981' : '#f59e0b'}"></span>
      <span class="storage-text">${isConnected ? '⚡ MongoDB Atlas · Live WebSocket Sync' : '⚠️ MongoDB Connecting...'}</span>
    `;
    ind.title = isConnected
      ? 'Connected to MongoDB Atlas with active Socket.IO real-time multi-user synchronization.'
      : 'Reconnecting to MongoDB backend...';
  }
}

/* ------------------------ AUTH SYNC HELPER --------------------------- */
async function syncSessionWithBackend(user) {
  if (!user || !user.email) return;

  const res = await api('/api/auth/switch-demo', {
    method: 'POST',
    body: { email: user.email }
  });

  if (res.success && res.token) {
    setAuthToken(res.token);
    user.mongoId = res.user.id;
    user.systemRole = res.user.systemRole || 'member';
    initHubSocket();
    loadTrustViewData();
  }
}

/* =====================================================================
   VIEW 1: COMMUNITY KNOWLEDGE HUB
   ===================================================================== */

const SKILL_TAGS = [
  'Python', 'Java', 'AI/ML', 'Web Development', 'UI/UX',
  'Graphic Design', 'Communication', 'Data & AI', 'Public Speaking'
];

views.community = () => {
  return `
    <div class="hub-hero">
      <div class="hub-hero-text">
        <h2>🌐 Community Knowledge Hub</h2>
        <p>Discover peer-reviewed tutorials, learning tips, implementation notes, and curated resources. Every post and reaction is synced live across all active accounts.</p>
      </div>
      <button class="btn primary glow" data-action="openCreatePostModal">
        <span>✏️</span> Share Knowledge
      </button>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="hub-toolbar">
      <div class="hub-search-row">
        <div class="hub-search-input">
          <span class="hub-search-icon">🔍</span>
          <input type="text" id="hubSearchInput" placeholder="Search by title, tutorial notes, or keywords..." value="${esc(HubState.searchQuery)}" data-action="hubSearchInput">
        </div>

        <select class="hub-sort-select" id="hubSortSelect" data-action="hubSortChange">
          <option value="newest" ${HubState.currentSort === 'newest' ? 'selected' : ''}>✨ Newest First</option>
          <option value="most_helpful" ${HubState.currentSort === 'most_helpful' ? 'selected' : ''}>💡 Most Helpful</option>
          <option value="most_discussed" ${HubState.currentSort === 'most_discussed' ? 'selected' : ''}>💬 Most Discussed</option>
          <option value="most_liked" ${HubState.currentSort === 'most_liked' ? 'selected' : ''}>❤️ Most Liked</option>
        </select>
      </div>

      <!-- Content Type Tabs -->
      <div class="tabs" style="margin-bottom: 0;">
        <button class="tab ${HubState.currentType === '' ? 'active' : ''}" data-action="filterHubType" data-type="">All Content</button>
        <button class="tab ${HubState.currentType === 'tutorial' ? 'active' : ''}" data-action="filterHubType" data-type="tutorial">📚 Tutorials</button>
        <button class="tab ${HubState.currentType === 'notes' ? 'active' : ''}" data-action="filterHubType" data-type="notes">📝 Notes</button>
        <button class="tab ${HubState.currentType === 'learning-tip' ? 'active' : ''}" data-action="filterHubType" data-type="learning-tip">💡 Learning Tips</button>
        <button class="tab ${HubState.currentType === 'resource-link' ? 'active' : ''}" data-action="filterHubType" data-type="resource-link">🔗 Resources</button>
      </div>

      <!-- Skill Tag Chips -->
      <div class="tag-chips-wrap">
        <span class="tag-chip-label">Skill Tag:</span>
        <button class="tag-pill ${HubState.currentTag === '' ? 'active' : ''}" data-action="filterHubTag" data-tag="">All</button>
        ${SKILL_TAGS.map(tag => `
          <button class="tag-pill ${HubState.currentTag.toLowerCase() === tag.toLowerCase() ? 'active' : ''}" data-action="filterHubTag" data-tag="${esc(tag)}">
            #${esc(tag)}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Feed Container -->
    <div id="hubFeedContainer" class="hub-feed">
      <div class="empty"><span class="empty-icon">⏳</span><div>Loading verified community posts from MongoDB Atlas...</div></div>
    </div>
  `;
};

after.community = async () => {
  await fetchHubPosts();
};

async function fetchHubPosts() {
  const container = document.getElementById('hubFeedContainer');
  if (!container) return;

  const params = new URLSearchParams();
  params.set('page', HubState.currentPage);
  params.set('limit', 15);
  params.set('sort', HubState.currentSort);
  if (HubState.currentTag) params.set('tag', HubState.currentTag);
  if (HubState.currentType) params.set('type', HubState.currentType);
  if (HubState.searchQuery) params.set('search', HubState.searchQuery);

  const res = await api(`/api/posts?${params.toString()}`);
  if (res.success) {
    HubState.posts = res.posts;
    HubState.totalPosts = res.pagination.total;
    renderHubFeed();
  } else {
    container.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span><div>${esc(res.error || 'Failed to load posts.')}</div></div>`;
  }
}

function renderHubFeed() {
  const container = document.getElementById('hubFeedContainer');
  if (!container) return;

  if (HubState.posts.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🍃</span>
        <div>No knowledge posts found matching your search. Be the first to publish a tutorial or tip!</div>
        <button class="btn primary sm mt-3 glow" data-action="openCreatePostModal">Create First Post</button>
      </div>
    `;
    return;
  }

  container.innerHTML = HubState.posts.map(p => renderPostCardHtml(p)).join('');
}

function renderPostCardHtml(post) {
  const authorName = post.author?.name || 'Community Member';
  const authorRole = post.author?.role || 'Member';
  const authorInst = post.author?.institution ? ` · ${post.author.institution}` : '';
  const isStaff = ['admin', 'moderator'].includes(post.author?.systemRole);
  const timeStr = formatRelativeTime(post.createdAt);

  const isLiked = post.userReacted?.like;
  const isHelpful = post.userReacted?.helpful;
  const isBookmarked = post.isBookmarked;

  let typeBadgeClass = 'notes';
  let typeLabel = 'Note';
  if (post.contentType === 'tutorial') { typeBadgeClass = 'tutorial'; typeLabel = 'Tutorial'; }
  else if (post.contentType === 'learning-tip') { typeBadgeClass = 'tip'; typeLabel = 'Learning Tip'; }
  else if (post.contentType === 'resource-link') { typeBadgeClass = 'resource'; typeLabel = 'Resource'; }

  return `
    <article class="post-card" id="post-${post.id}">
      <div class="post-card-head">
        <div class="post-author-box">
          ${avatar(authorName, 'md')}
          <div class="post-author-info">
            <span class="post-author-name">
              ${esc(authorName)}
              ${isStaff ? `<span class="badge" style="background:var(--primary-soft); color:#818cf8; font-size:10px;">${post.author.systemRole.toUpperCase()}</span>` : ''}
            </span>
            <span class="post-author-meta">${esc(authorRole)}${esc(authorInst)} · ${timeStr} ${post.isEdited ? '<i class="muted">(edited)</i>' : ''}</span>
          </div>
        </div>

        <div class="post-meta-badges">
          <span class="post-type-badge ${typeBadgeClass}">${typeLabel}</span>
          ${renderPostMenuHtml(post)}
        </div>
      </div>

      <h3 class="post-title">${esc(post.title)}</h3>
      <div class="post-body">${renderSanitizedBody(post.content)}</div>

      ${post.resourceLink ? `
        <a href="${esc(post.resourceLink)}" target="_blank" rel="noopener noreferrer" class="post-resource-box">
          <div class="post-resource-left">
            <span style="font-size:20px;">🔗</span>
            <div>
              <div class="post-resource-title">${esc(post.resourceTitle || 'External Resource Link')}</div>
              <div class="post-resource-url">${esc(post.resourceLink)}</div>
            </div>
          </div>
          <span style="font-size:16px;" class="muted">↗</span>
        </a>
      ` : ''}

      ${post.tags && post.tags.length ? `
        <div class="post-tags-list">
          ${post.tags.map(t => `<span class="post-tag" data-action="clickTagChip" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}
        </div>
      ` : ''}

      <!-- Action Bar -->
      <div class="post-actions-bar">
        <div class="post-actions-left">
          <button class="reaction-btn like ${isLiked ? 'active' : ''}" id="rx-like-${post.id}" data-action="toggleReaction" data-id="${post.id}" data-type="like" title="Like this post">
            <span>❤️</span> <b id="rx-like-count-${post.id}">${post.reactionsCount?.like || 0}</b>
          </button>
          <button class="reaction-btn helpful ${isHelpful ? 'active' : ''}" id="rx-helpful-${post.id}" data-action="toggleReaction" data-id="${post.id}" data-type="helpful" title="Mark as Helpful">
            <span>💡</span> <b>Helpful</b> <span id="rx-helpful-count-${post.id}">(${post.reactionsCount?.helpful || 0})</span>
          </button>
          <button class="btn ghost sm" data-action="toggleCommentsDrawer" data-id="${post.id}">
            <span>💬</span> <span id="comment-badge-${post.id}">${post.commentsCount || 0} Comment${post.commentsCount === 1 ? '' : 's'}</span>
          </button>
        </div>

        <div>
          <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" id="bm-btn-${post.id}" data-action="toggleBookmark" data-id="${post.id}" title="Private bookmark (saved to your MongoDB account)">
            <span>${isBookmarked ? '★' : '☆'}</span> <span>${isBookmarked ? 'Saved' : 'Bookmark'}</span>
          </button>
        </div>
      </div>

      <!-- Collapsible Comments Drawer -->
      <div class="comments-drawer hidden" id="comments-drawer-${post.id}">
        <div id="comments-list-${post.id}">
          <div class="text-xs muted center py-2">Loading comments...</div>
        </div>
        <div class="comment-input-wrap">
          <input type="text" placeholder="Write a constructive comment or question..." id="comment-input-${post.id}" onkeydown="if(event.key==='Enter') HubActions.submitComment('${post.id}')">
          <button class="btn primary sm" data-action="submitComment" data-id="${post.id}">Post</button>
        </div>
      </div>
    </article>
  `;
}

function renderPostMenuHtml(post) {
  const isAuthor = post.canEdit;
  const canDelete = post.canDelete;

  return `
    <div style="display:flex; gap:6px;">
      ${isAuthor ? `<button class="icon-btn text-xs" data-action="editPostModal" data-id="${post.id}" title="Edit your post">✏️</button>` : ''}
      ${canDelete ? `<button class="icon-btn text-xs" data-action="deletePostConfirm" data-id="${post.id}" title="Delete post">🗑️</button>` : ''}
      ${!isAuthor ? `
        <button class="icon-btn text-xs" data-action="openReportModal" data-type="post" data-id="${post.id}" title="Report inappropriate post">🚩</button>
      ` : ''}
    </div>
  `;
}

function renderSanitizedBody(text) {
  if (!text) return '';
  return esc(text)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;">$1</a>');
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return fmtDate(dateStr.slice(0, 10));
}

function updatePostReactionDOM(postId, reactionsCount, reactionType, added, userId) {
  const countLikeEl = document.getElementById(`rx-like-count-${postId}`);
  const countHelpfulEl = document.getElementById(`rx-helpful-count-${postId}`);
  if (countLikeEl) countLikeEl.textContent = reactionsCount.like || 0;
  if (countHelpfulEl) countHelpfulEl.textContent = `(${reactionsCount.helpful || 0})`;

  if (me && (me.mongoId === userId || me.id === userId)) {
    const btn = document.getElementById(`rx-${reactionType}-${postId}`);
    if (btn) btn.classList.toggle('active', added);
  }
}

function updatePostCommentBadgeDOM(postId, count) {
  const badge = document.getElementById(`comment-badge-${postId}`);
  if (badge) badge.textContent = `${count} Comment${count === 1 ? '' : 's'}`;
}

function appendCommentToDOM(container, c) {
  const existingEmpty = container.querySelector('.muted');
  if (existingEmpty) existingEmpty.remove();

  const el = document.createElement('div');
  el.className = `comment-item ${c.parentId ? 'reply' : ''}`;
  el.id = `comment-${c.id}`;
  el.innerHTML = `
    ${avatar(c.author?.name || 'Peer', 'sm')}
    <div class="comment-content-box">
      <div class="comment-head">
        <span class="comment-author-name">${esc(c.author?.name || 'Peer')}</span>
        <span class="comment-time">${formatRelativeTime(c.createdAt)}</span>
      </div>
      <div class="comment-text">${esc(c.content)}</div>
      <div style="display:flex; gap:10px; margin-top:4px;">
        <button class="text-xs muted link" data-action="replyComment" data-postid="${c.postId}" data-commentid="${c.id}" data-author="${esc(c.author?.name || '')}">Reply</button>
        ${c.canDelete ? `<button class="text-xs muted link text-danger" data-action="deleteComment" data-id="${c.id}">Delete</button>` : ''}
        <button class="text-xs muted link" data-action="openReportModal" data-type="comment" data-id="${c.id}">Report</button>
      </div>
    </div>
  `;
  container.appendChild(el);
}

/* =====================================================================
   VIEW 2: SAVED BOOKMARKS (PRIVATE TO CURRENT USER)
   ===================================================================== */

views.bookmarks = () => {
  return `
    <div class="hub-hero" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.08));">
      <div class="hub-hero-text">
        <h2>🔖 Saved Knowledge Bookmarks</h2>
        <p>Your private repository of saved tutorials, architecture notes, and learning resources. Securely preserved in MongoDB Atlas across logout and login.</p>
      </div>
      <a href="#community" class="btn sm primary glow">Explore Knowledge Hub</a>
    </div>

    <div id="bookmarksListContainer" class="hub-feed">
      <div class="empty"><span class="empty-icon">⏳</span><div>Fetching your private bookmarks from MongoDB...</div></div>
    </div>
  `;
};

after.bookmarks = async () => {
  const container = document.getElementById('bookmarksListContainer');
  if (!container) return;

  const res = await api('/api/bookmarks');
  if (res.success) {
    if (res.bookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <span class="empty-icon">🔖</span>
          <div>No bookmarks saved yet. Browse the Community Hub and click "Bookmark" on any tutorial or tip to save it here!</div>
          <a href="#community" class="btn primary sm mt-3 glow">Browse Knowledge Hub</a>
        </div>
      `;
      return;
    }

    container.innerHTML = res.bookmarks.map(b => {
      const p = b.post;
      return `
        <article class="post-card" id="bm-card-${p.id}">
          <div class="post-card-head">
            <div class="post-author-box">
              ${avatar(p.author?.name || 'Author', 'md')}
              <div class="post-author-info">
                <span class="post-author-name">${esc(p.author?.name || 'Author')}</span>
                <span class="post-author-meta">${esc(p.author?.role || 'Member')} · Saved on ${fmtDate(b.createdAt.slice(0, 10))}</span>
              </div>
            </div>
            <button class="btn sm ghost" data-action="removeBookmarkDirect" data-id="${p.id}" title="Remove from bookmarks">
              ✕ Remove
            </button>
          </div>

          <h3 class="post-title">${esc(p.title)}</h3>
          <div class="post-body">${renderSanitizedBody(p.content.slice(0, 250))}${p.content.length > 250 ? '...' : ''}</div>

          ${p.resourceLink ? `
            <a href="${esc(p.resourceLink)}" target="_blank" rel="noopener noreferrer" class="post-resource-box">
              <span style="font-size:18px;">🔗</span>
              <div><b>${esc(p.resourceTitle || 'Resource Link')}</b><div class="text-xs muted">${esc(p.resourceLink)}</div></div>
            </a>
          ` : ''}

          <div class="post-actions-bar">
            <span class="text-xs muted">❤️ ${p.reactionsCount?.like || 0} Likes · 💡 ${p.reactionsCount?.helpful || 0} Helpful · 💬 ${p.commentsCount || 0} Comments</span>
            <a href="#community" class="btn sm primary glow">View in Hub ➔</a>
          </div>
        </article>
      `;
    }).join('');
  } else {
    container.innerHTML = `<div class="empty"><span class="empty-icon">⚠️</span><div>${esc(res.error || 'Failed to load bookmarks.')}</div></div>`;
  }
};

/* =====================================================================
   VIEW 3: TRUST SCORE & SKILL VERIFICATION CENTER
   ===================================================================== */

views.trust = () => {
  const trust = HubState.myTrustData || {
    trustScore: 45,
    trustTier: 'Active Learner',
    tierBadge: '⚡',
    metrics: { completedSessionsCount: 0, reviewCount: 0, averageRating: 0, verifiedSkillsCount: 0, endorsementsCount: 0 },
    breakdown: [],
    verifiedSkillsList: [],
    endorsementsBySkill: {},
    recentReviews: []
  };

  return `
    <!-- Top Trust Reputation Card -->
    <div class="trust-score-hero">
      <div class="trust-dial-box">
        <div class="trust-tier-label">${trust.tierBadge} ${esc(trust.trustTier)}</div>
        <div class="trust-score-number" id="trustScoreDisplay">${trust.trustScore}</div>
        <div class="text-xs muted">out of 100 Trust Points</div>
        <div class="trust-disclaimer">Documented Platform Activity Score</div>
      </div>

      <div>
        <h3 style="font-size:20px; margin-bottom:8px;">Transparent Trust Reputation Engine</h3>
        <p class="muted text-sm mb-3">Your Trust Score reflects genuine collaboration: completed peer sessions, verified skill evidence, authentic reviews, and community endorsements. Points cannot be bought or self-generated.</p>
        
        <div class="trust-breakdown-list">
          ${trust.breakdown.map(b => `
            <div class="breakdown-row">
              <div class="breakdown-info">
                <span class="breakdown-title">${esc(b.factor)}</span>
                <span class="breakdown-sub">${esc(b.detail)}</span>
              </div>
              <span class="breakdown-points">${b.pointsAwarded >= 0 ? '+' : ''}${b.pointsAwarded} pts</span>
            </div>
          `).join('')}
        </div>

        <p class="text-xs muted mt-3" style="font-style:italic;">
          ⚖️ <b>Disclaimer:</b> ${esc(trust.disclaimer || 'The SkillSwap Trust Score is an algorithmic reputation metric calculated strictly from confirmed peer exchange sessions, peer reviews, community endorsements, and moderator-verified credentials. It is intended for peer trust transparency and does not constitute a legal certification or safety guarantee.')}
        </p>
      </div>
    </div>

    <!-- Quick Action Bar -->
    <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="btn primary glow" data-action="openVerificationModal">
        <span>🛡️</span> Request Skill Verification
      </button>
      <button class="btn glow" data-action="openEndorseModal">
        <span>🤝</span> Endorse a Peer
      </button>
    </div>

    <!-- Verified Skills & Evidence Section -->
    <div class="card mb-4">
      <div class="card-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3 style="font-size:16px;">🛡️ Officially Verified Skills (${trust.verifiedSkillsList?.length || 0})</h3>
        <span class="text-xs muted">Approved by SkillSwap Moderators</span>
      </div>
      ${trust.verifiedSkillsList && trust.verifiedSkillsList.length ? `
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          ${trust.verifiedSkillsList.map(v => `
            <div class="verified-shield" style="padding:6px 14px; font-size:13px;">
              <span>🛡️</span>
              <b>${esc(v.skill)}</b>
              <span class="muted" style="font-weight:normal;">(${esc(v.category)})</span>
              <a href="${esc(v.evidenceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--teach); text-decoration:underline; font-size:11px; margin-left:6px;">View Evidence ↗</a>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="text-sm muted">No officially verified skills yet. Submit evidence (portfolio, GitHub, certification) to earn moderator verification and +15 trust points!</div>
      `}
    </div>

    <!-- Completed Peer Sessions & Eligible Reviews -->
    <div class="card mb-4">
      <div class="card-head" style="margin-bottom:14px;">
        <h3 style="font-size:16px;">⭐ Completed Exchange Sessions &amp; Partner Reviews</h3>
        <p class="text-xs muted">Backend Rule: You can only rate and review a learning partner after a confirmed completed session between you.</p>
      </div>
      <div id="completedSessionsContainer">
        <div class="text-xs muted">Loading completed exchange sessions...</div>
      </div>
    </div>

    <!-- Peer Endorsements Received -->
    <div class="g2 mb-4">
      <div class="card">
        <div class="card-head" style="margin-bottom:14px;">
          <h3 style="font-size:16px;">🤝 Peer Skill Endorsements Received</h3>
          <p class="text-xs muted">Validated by exchange partners who observed your work</p>
        </div>
        <div id="endorsementsListContainer">
          <div class="text-xs muted">Loading peer endorsements...</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head" style="margin-bottom:14px;">
          <h3 style="font-size:16px;">💬 Recent Verified Reviews Received</h3>
          <p class="text-xs muted">Authentic testimonials from completed learning sessions</p>
        </div>
        <div id="reviewsListContainer">
          <div class="text-xs muted">Loading partner reviews...</div>
        </div>
      </div>
    </div>
  `;
};

after.trust = async () => {
  await loadTrustViewData();
};

async function loadTrustViewData() {
  if (!me) return;

  // 1. Fetch User Trust Profile
  const trustRes = await api('/api/auth/me');
  if (trustRes.success && trustRes.user) {
    const fullRes = await api(`/api/users/${trustRes.user.id}`);
    if (fullRes.success) {
      HubState.myTrustData = fullRes.trust;
      const numEl = document.getElementById('trustScoreDisplay');
      if (numEl) numEl.textContent = fullRes.trust.trustScore;
    }
  }

  // 2. Fetch Completed Sessions for Reviews
  const sessRes = await api('/api/sessions/completed');
  const sessContainer = document.getElementById('completedSessionsContainer');
  if (sessContainer) {
    if (sessRes.success && sessRes.sessions && sessRes.sessions.length > 0) {
      sessContainer.innerHTML = sessRes.sessions.map(s => `
        <div style="background:var(--bg-surface-elevated); border:1px solid var(--line); border-radius:var(--radius-md); padding:14px 18px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
          <div>
            <b>${esc(s.skill)} Session</b> with <b>${esc(s.partner.name)}</b> (${esc(s.myRole)})
            <div class="text-xs muted">${fmtDate(s.date.slice(0, 10))} · ${s.minutes} minutes · Notes: "${esc(s.notes || 'Collaborative session')}"</div>
          </div>
          <div>
            ${s.hasReviewed ? `
              <span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">✅ Reviewed (${s.review.rating}★)</span>
            ` : `
              <button class="btn sm primary glow" data-action="openWriteReviewModal" data-sessionid="${s.id}" data-partnername="${esc(s.partner.name)}" data-skill="${esc(s.skill)}">
                ⭐ Write Review
              </button>
            `}
          </div>
        </div>
      `).join('');
    } else {
      sessContainer.innerHTML = `<div class="text-sm muted">No completed sessions logged yet. Log completed sessions in Activity Log to unlock peer reviews!</div>`;
    }
  }

  // 3. Fetch Endorsements
  if (me && me.mongoId) {
    const endRes = await api(`/api/endorsements/user/${me.mongoId}`);
    const endContainer = document.getElementById('endorsementsListContainer');
    if (endContainer) {
      if (endRes.success && endRes.endorsements && endRes.endorsements.length > 0) {
        endContainer.innerHTML = endRes.endorsements.map(e => `
          <div style="padding:10px 0; border-bottom:1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <b>#${esc(e.skill)}</b>
              <span class="text-xs muted">by ${esc(e.endorser.name)}</span>
            </div>
            ${e.comment ? `<p class="text-xs mt-1 muted">"${esc(e.comment)}"</p>` : ''}
            ${e.evidenceUrl ? `<a href="${esc(e.evidenceUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs link" style="color:var(--primary);">Evidence Link ↗</a>` : ''}
          </div>
        `).join('');
      } else {
        endContainer.innerHTML = `<div class="text-sm muted">No peer endorsements received yet. Collaborate with peers to earn skill endorsements!</div>`;
      }
    }

    // 4. Fetch Reviews
    const revRes = await api(`/api/reviews/user/${me.mongoId}`);
    const revContainer = document.getElementById('reviewsListContainer');
    if (revContainer) {
      if (revRes.success && revRes.reviews && revRes.reviews.length > 0) {
        revContainer.innerHTML = revRes.reviews.map(r => `
          <div style="padding:10px 0; border-bottom:1px solid var(--line);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="star-rating" style="font-size:14px; color:var(--mutual);">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              <span class="text-xs muted">from ${esc(r.reviewer.name)}</span>
            </div>
            <p class="text-xs mt-1" style="color:var(--text-main);">"${esc(r.comment)}"</p>
            <span class="text-xs muted">Skill: ${esc(r.skill)}</span>
          </div>
        `).join('');
      } else {
        revContainer.innerHTML = `<div class="text-sm muted">No reviews received yet. Partner reviews appear after completed exchange sessions!</div>`;
      }
    }
  }
}

/* =====================================================================
   VIEW 4: MODERATION DASHBOARD (ADMIN & MODERATOR ONLY)
   ===================================================================== */

views.moderation = () => {
  if (!me || !['admin', 'moderator'].includes(me.systemRole)) {
    return `
      <div class="empty">
        <span class="empty-icon">🔒</span>
        <h3>Restricted Access</h3>
        <p class="muted">The Moderation Dashboard is strictly accessible by authorized Administrators and Moderators.</p>
        <a href="#dashboard" class="btn sm mt-3">Return to Dashboard</a>
      </div>
    `;
  }

  return `
    <div class="hub-hero" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(99, 102, 241, 0.1));">
      <div class="hub-hero-text">
        <h2>⚖️ Moderation &amp; Verification Hub</h2>
        <p>Review community skill verification requests, resolve flagged reports, and uphold network trust and safety standards.</p>
      </div>
      <span class="badge" style="background:var(--danger); color:white; font-size:12px; padding:6px 14px;">
        ROLE: ${me.systemRole.toUpperCase()}
      </span>
    </div>

    <!-- Stats Overview -->
    <div class="mod-stats-grid" id="modStatsOverview">
      <div class="mod-stat-card">
        <div class="mod-stat-icon" style="color:var(--primary);">🛡️</div>
        <div>
          <div class="text-xs uppercase muted font-bold">Pending Verifications</div>
          <div style="font-size:22px; font-weight:800;" id="modStatVerif">0</div>
        </div>
      </div>
      <div class="mod-stat-card">
        <div class="mod-stat-icon" style="color:var(--danger);">🚩</div>
        <div>
          <div class="text-xs uppercase muted font-bold">Open Reports</div>
          <div style="font-size:22px; font-weight:800;" id="modStatReports">0</div>
        </div>
      </div>
      <div class="mod-stat-card">
        <div class="mod-stat-icon" style="color:var(--teach);">👥</div>
        <div>
          <div class="text-xs uppercase muted font-bold">Total Network Users</div>
          <div style="font-size:22px; font-weight:800;" id="modStatUsers">0</div>
        </div>
      </div>
      <div class="mod-stat-card">
        <div class="mod-stat-icon" style="color:var(--learn);">📚</div>
        <div>
          <div class="text-xs uppercase muted font-bold">Knowledge Posts</div>
          <div style="font-size:22px; font-weight:800;" id="modStatPosts">0</div>
        </div>
      </div>
    </div>

    <!-- Moderation Tabs -->
    <div class="tabs">
      <button class="tab active" data-action="modTabSwitch" data-tab="verifications">Pending Skill Verifications</button>
      <button class="tab" data-action="modTabSwitch" data-tab="reports">Community Reports</button>
    </div>

    <!-- Section 1: Verifications Queue -->
    <div id="modVerificationsSection" class="card">
      <h3 style="font-size:16px; margin-bottom:14px;">🛡️ Skill Verification Requests</h3>
      <div id="modVerificationsTableContainer">
        <div class="text-xs muted">Loading verification requests...</div>
      </div>
    </div>

    <!-- Section 2: Reports Queue -->
    <div id="modReportsSection" class="card hidden">
      <h3 style="font-size:16px; margin-bottom:14px;">🚩 Flagged Content Reports</h3>
      <div id="modReportsTableContainer">
        <div class="text-xs muted">Loading moderation reports...</div>
      </div>
    </div>
  `;
};

after.moderation = async () => {
  if (!me || !['admin', 'moderator'].includes(me.systemRole)) return;
  await loadModerationData();
};

async function loadModerationData() {
  // 1. Overview stats
  const statsRes = await api('/api/moderation/overview');
  if (statsRes.success) {
    const s = statsRes.stats;
    const vEl = document.getElementById('modStatVerif'); if (vEl) vEl.textContent = s.pendingVerifications;
    const rEl = document.getElementById('modStatReports'); if (rEl) rEl.textContent = s.pendingReports;
    const uEl = document.getElementById('modStatUsers'); if (uEl) uEl.textContent = s.totalUsers;
    const pEl = document.getElementById('modStatPosts'); if (pEl) pEl.textContent = s.totalPosts;
  }

  // 2. Pending Verifications
  const verifRes = await api('/api/verifications?status=pending');
  const verifCont = document.getElementById('modVerificationsTableContainer');
  if (verifCont) {
    if (verifRes.success && verifRes.verifications && verifRes.verifications.length > 0) {
      verifCont.innerHTML = `
        <table class="mod-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Skill &amp; Category</th>
              <th>Evidence Link</th>
              <th>Applicant Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${verifRes.verifications.map(v => `
              <tr id="verif-row-${v._id}">
                <td>
                  <b>${esc(v.userId?.name || 'User')}</b>
                  <div class="text-xs muted">${esc(v.userId?.email || '')}</div>
                </td>
                <td>
                  <b>${esc(v.skill)}</b>
                  <div class="text-xs muted">${esc(v.category)}</div>
                </td>
                <td>
                  <a href="${esc(v.evidenceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:underline;">
                    Review Link ↗
                  </a>
                </td>
                <td class="text-xs">${esc(v.notes || '—')}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn sm ok" data-action="approveVerification" data-id="${v._id}">Approve ✅</button>
                    <button class="btn sm danger" data-action="rejectVerification" data-id="${v._id}">Reject ❌</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      verifCont.innerHTML = `<div class="text-sm muted py-3">✅ All verification requests have been reviewed. Queue is clean!</div>`;
    }
  }

  // 3. Open Reports
  const repRes = await api('/api/reports?status=pending');
  const repCont = document.getElementById('modReportsTableContainer');
  if (repCont) {
    if (repRes.success && repRes.reports && repRes.reports.length > 0) {
      repCont.innerHTML = `
        <table class="mod-table">
          <thead>
            <tr>
              <th>Target Type</th>
              <th>Reason</th>
              <th>Reporter</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${repRes.reports.map(r => `
              <tr id="report-row-${r._id}">
                <td><span class="badge danger">${esc(r.targetType.toUpperCase())}</span></td>
                <td>
                  <b>${esc(r.reason)}</b>
                  <div class="text-xs muted">${esc(r.details || '')}</div>
                </td>
                <td>${esc(r.reporterId?.name || 'Anonymous')}</td>
                <td class="text-xs muted">${fmtDate(r.createdAt.slice(0, 10))}</td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn sm danger" data-action="resolveReportTakeAction" data-id="${r._id}">Remove Content 🗑️</button>
                    <button class="btn sm ghost" data-action="dismissReport" data-id="${r._id}">Dismiss</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      repCont.innerHTML = `<div class="text-sm muted py-3">✅ No open reports found. Community standing is clean!</div>`;
    }
  }
}

/* =====================================================================
   INTERACTIVE ACTIONS DISPATCHER
   ===================================================================== */

const HubActions = {
  // Navigation & Filters
  hubSearchInput(el) {
    HubState.searchQuery = el.value.trim();
    clearTimeout(HubState._searchDebounce);
    HubState._searchDebounce = setTimeout(() => {
      HubState.currentPage = 1;
      fetchHubPosts();
    }, 300);
  },

  hubSortChange(el) {
    HubState.currentSort = el.value;
    HubState.currentPage = 1;
    fetchHubPosts();
  },

  filterHubType(el) {
    HubState.currentType = el.dataset.type;
    $$('.hub-toolbar .tab').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    HubState.currentPage = 1;
    fetchHubPosts();
  },

  filterHubTag(el) {
    HubState.currentTag = el.dataset.tag;
    $$('.tag-chips-wrap .tag-pill').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    HubState.currentPage = 1;
    fetchHubPosts();
  },

  clickTagChip(el) {
    const tag = el.dataset.tag;
    HubState.currentTag = tag;
    HubState.currentPage = 1;
    fetchHubPosts();
  },

  // Post Reactions
  async toggleReaction(el) {
    const postId = el.dataset.id;
    const reactionType = el.dataset.type;
    const res = await api(`/api/posts/${postId}/reactions`, {
      method: 'POST',
      body: { reactionType }
    });

    if (res.success) {
      updatePostReactionDOM(postId, res.reactionsCount, reactionType, res.added, me ? (me.mongoId || me.id) : null);
    } else {
      toast(res.error || 'Reaction failed', 'err');
    }
  },

  // Bookmarks
  async toggleBookmark(el) {
    const postId = el.dataset.id;
    const res = await api(`/api/bookmarks/${postId}`, { method: 'POST' });
    if (res.success) {
      el.classList.toggle('active', res.isBookmarked);
      el.querySelector('span:first-child').textContent = res.isBookmarked ? '★' : '☆';
      el.querySelector('span:last-child').textContent = res.isBookmarked ? 'Saved' : 'Bookmark';
      toast(res.isBookmarked ? '🔖 Saved to your private bookmarks!' : 'Bookmark removed.', 'ok');
    } else {
      toast(res.error || 'Bookmark action failed', 'err');
    }
  },

  async removeBookmarkDirect(el) {
    const postId = el.dataset.id;
    const res = await api(`/api/bookmarks/${postId}`, { method: 'POST' });
    if (res.success) {
      const card = document.getElementById(`bm-card-${postId}`);
      if (card) card.remove();
      toast('Removed from bookmarks.', 'ok');
    }
  },

  // Comments Drawer & Submission
  async toggleCommentsDrawer(el) {
    const postId = el.dataset.id;
    const drawer = document.getElementById(`comments-drawer-${postId}`);
    if (!drawer) return;

    if (drawer.classList.contains('hidden')) {
      drawer.classList.remove('hidden');
      const listCont = document.getElementById(`comments-list-${postId}`);
      if (listCont) {
        listCont.innerHTML = `<div class="text-xs muted center py-2">Loading comments...</div>`;
        const res = await api(`/api/posts/${postId}/comments`);
        if (res.success) {
          if (res.comments.length === 0) {
            listCont.innerHTML = `<div class="text-xs muted center py-2">No comments yet. Start the conversation!</div>`;
          } else {
            listCont.innerHTML = '';
            res.comments.forEach(c => appendCommentToDOM(listCont, c));
          }
        }
      }
    } else {
      drawer.classList.add('hidden');
    }
  },

  async submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input || !input.value.trim()) return;

    const content = input.value.trim();
    input.value = '';

    const res = await api(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: { content }
    });

    if (res.success) {
      toast('Comment posted!', 'ok');
    } else {
      toast(res.error || 'Failed to post comment', 'err');
    }
  },

  replyComment(el) {
    const postId = el.dataset.postid;
    const author = el.dataset.author;
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
      input.value = `@${author} `;
      input.focus();
    }
  },

  async deleteComment(el) {
    const id = el.dataset.id;
    if (!confirm('Are you sure you want to delete this comment?')) return;
    const res = await api(`/api/comments/${id}`, { method: 'DELETE' });
    if (res.success) {
      toast('Comment deleted.', 'ok');
    } else {
      toast(res.error || 'Failed to delete comment', 'err');
    }
  },

  // Modals: Create & Edit Post
  openCreatePostModal() {
    openModal('Share Knowledge with the Community', `
      <form id="createPostForm" onsubmit="event.preventDefault(); HubActions.handleCreatePostSubmit(this);">
        <label>
          <span>Title</span>
          <input name="title" required placeholder="e.g. Master React Concurrency &amp; Server Components" maxlength="200">
        </label>

        <div class="row2">
          <label>
            <span>Content Type</span>
            <select name="contentType">
              <option value="tutorial">📚 Step-by-Step Tutorial</option>
              <option value="notes" selected>📝 Implementation Notes</option>
              <option value="learning-tip">💡 Quick Learning Tip</option>
              <option value="resource-link">🔗 Resource / Project Link</option>
            </select>
          </label>

          <label>
            <span>Skill Tags (comma separated)</span>
            <input name="tags" placeholder="e.g. Python, Web Development, AI/ML" value="Web Development">
          </label>
        </div>

        <label>
          <span>Content / Explanation / Notes</span>
          <textarea name="content" rows="6" required placeholder="Share clear explanations, code patterns, learning milestones, and takeaways..."></textarea>
        </label>

        <div class="row2">
          <label>
            <span>Resource Link URL (optional)</span>
            <input type="url" name="resourceLink" placeholder="https://github.com/... or https://docs...">
          </label>
          <label>
            <span>Resource Title (optional)</span>
            <input name="resourceTitle" placeholder="e.g. GitHub Repository, Official Docs">
          </label>
        </div>

        <button class="btn primary block glow mt-3" type="submit">Publish to Community Hub</button>
      </form>
    `, true);
  },

  async handleCreatePostSubmit(form) {
    const title = form.title.value.trim();
    const content = form.content.value.trim();
    const contentType = form.contentType.value;
    const tags = form.tags.value;
    const resourceLink = form.resourceLink.value.trim();
    const resourceTitle = form.resourceTitle.value.trim();

    const res = await api('/api/posts', {
      method: 'POST',
      body: { title, content, contentType, tags, resourceLink, resourceTitle }
    });

    if (res.success) {
      closeModal();
      toast('Your knowledge post is live in the community!', 'ok');
      if (typeof triggerConfetti === 'function') triggerConfetti();
      if (location.hash !== '#community') location.hash = '#community';
      else fetchHubPosts();
    } else {
      toast(res.error || 'Failed to create post', 'err');
    }
  },

  async editPostModal(el) {
    const postId = el.dataset.id;
    const post = HubState.posts.find(p => p.id === postId);
    if (!post) return;

    openModal('Edit Knowledge Post', `
      <form onsubmit="event.preventDefault(); HubActions.handleEditPostSubmit(this, '${postId}');">
        <label>
          <span>Title</span>
          <input name="title" required value="${esc(post.title)}" maxlength="200">
        </label>

        <div class="row2">
          <label>
            <span>Content Type</span>
            <select name="contentType">
              <option value="tutorial" ${post.contentType === 'tutorial' ? 'selected' : ''}>📚 Step-by-Step Tutorial</option>
              <option value="notes" ${post.contentType === 'notes' ? 'selected' : ''}>📝 Implementation Notes</option>
              <option value="learning-tip" ${post.contentType === 'learning-tip' ? 'selected' : ''}>💡 Quick Learning Tip</option>
              <option value="resource-link" ${post.contentType === 'resource-link' ? 'selected' : ''}>🔗 Resource / Project Link</option>
            </select>
          </label>
          <label>
            <span>Skill Tags</span>
            <input name="tags" value="${esc((post.tags || []).join(', '))}">
          </label>
        </div>

        <label>
          <span>Content</span>
          <textarea name="content" rows="6" required>${esc(post.content)}</textarea>
        </label>

        <div class="row2">
          <label>
            <span>Resource URL</span>
            <input type="url" name="resourceLink" value="${esc(post.resourceLink || '')}">
          </label>
          <label>
            <span>Resource Title</span>
            <input name="resourceTitle" value="${esc(post.resourceTitle || '')}">
          </label>
        </div>

        <button class="btn primary block glow mt-3" type="submit">Save Changes</button>
      </form>
    `, true);
  },

  async handleEditPostSubmit(form, postId) {
    const title = form.title.value.trim();
    const content = form.content.value.trim();
    const contentType = form.contentType.value;
    const tags = form.tags.value;
    const resourceLink = form.resourceLink.value.trim();
    const resourceTitle = form.resourceTitle.value.trim();

    const res = await api(`/api/posts/${postId}`, {
      method: 'PUT',
      body: { title, content, contentType, tags, resourceLink, resourceTitle }
    });

    if (res.success) {
      closeModal();
      toast('Post updated successfully.', 'ok');
    } else {
      toast(res.error || 'Failed to edit post', 'err');
    }
  },

  async deletePostConfirm(el) {
    const postId = el.dataset.id;
    if (!confirm('Are you sure you want to permanently delete this post? This cannot be undone.')) return;
    const res = await api(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.success) {
      toast('Post deleted.', 'ok');
    } else {
      toast(res.error || 'Failed to delete post', 'err');
    }
  },

  // Write Review Modal (Enforced only after verified completed session)
  openWriteReviewModal(el) {
    const sessionId = el.dataset.sessionid;
    const partnerName = el.dataset.partnername;
    const skill = el.dataset.skill;

    openModal(`Review Learning Partner: ${partnerName}`, `
      <form onsubmit="event.preventDefault(); HubActions.handleReviewSubmit(this, '${sessionId}', '${esc(skill)}');">
        <p class="text-sm muted mb-3">Reviewing completed exchange session for <b>${esc(skill)}</b> with <b>${esc(partnerName)}</b>.</p>

        <label>
          <span>Star Rating</span>
          <div class="star-rating" id="reviewStarPicker" style="margin: 8px 0; font-size:26px;">
            <span data-star="1" class="active">★</span>
            <span data-star="2" class="active">★</span>
            <span data-star="3" class="active">★</span>
            <span data-star="4" class="active">★</span>
            <span data-star="5" class="active">★</span>
          </div>
          <input type="hidden" name="rating" id="reviewRatingInput" value="5">
        </label>

        <label>
          <span>Constructive Testimonial &amp; Feedback</span>
          <textarea name="comment" rows="4" required placeholder="Describe their teaching clarity, punctuality, practical exercises, and collaboration style..."></textarea>
        </label>

        <button class="btn primary block glow mt-3" type="submit">Submit Verified Review</button>
      </form>
    `);

    // Star picker logic
    const picker = document.getElementById('reviewStarPicker');
    if (picker) {
      const stars = [...picker.querySelectorAll('span')];
      stars.forEach(s => {
        s.addEventListener('click', () => {
          const val = +s.dataset.star;
          document.getElementById('reviewRatingInput').value = val;
          stars.forEach((st, idx) => {
            st.classList.toggle('active', idx < val);
          });
        });
      });
    }
  },

  async handleReviewSubmit(form, sessionId, skill) {
    const rating = +form.rating.value;
    const comment = form.comment.value.trim();

    const res = await api('/api/reviews', {
      method: 'POST',
      body: { sessionId, rating, comment, skill }
    });

    if (res.success) {
      closeModal();
      toast('⭐ Verified peer review submitted successfully!', 'ok');
      if (typeof triggerConfetti === 'function') triggerConfetti();
      await loadTrustViewData();
    } else {
      toast(res.error || 'Failed to submit review', 'err');
    }
  },

  // Peer Endorsement Modal
  async openEndorseModal() {
    const usersRes = await api('/api/auth/users');
    const peers = (usersRes.users || []).filter(u => u.email !== me.email);

    openModal('Endorse a Peer for Demonstrated Skill', `
      <form onsubmit="event.preventDefault(); HubActions.handleEndorseSubmit(this);">
        <p class="text-sm muted mb-3">Recognize a peer's competence that you observed during collaborative sessions or project reviews. Self-endorsements are prohibited.</p>

        <label>
          <span>Select Community Peer</span>
          <select name="recipientId" required>
            ${peers.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.role)} · ${esc(p.institution || '')})</option>`).join('')}
          </select>
        </label>

        <label>
          <span>Skill to Endorse</span>
          <input name="skill" required placeholder="e.g. Python, UI/UX, Web Development, Java">
        </label>

        <label>
          <span>Optional Evidence or Project Link</span>
          <input type="url" name="evidenceUrl" placeholder="https://github.com/... or portfolio link">
        </label>

        <label>
          <span>Endorsement Statement</span>
          <textarea name="comment" rows="3" placeholder="Explain how this peer demonstrated this skill during your collaboration..."></textarea>
        </label>

        <button class="btn primary block glow mt-3" type="submit">Submit Peer Endorsement</button>
      </form>
    `);
  },

  async handleEndorseSubmit(form) {
    const recipientId = form.recipientId.value;
    const skill = form.skill.value.trim();
    const evidenceUrl = form.evidenceUrl.value.trim();
    const comment = form.comment.value.trim();

    const res = await api('/api/endorsements', {
      method: 'POST',
      body: { recipientId, skill, evidenceUrl, comment }
    });

    if (res.success) {
      closeModal();
      toast('🤝 Peer endorsement recorded in MongoDB!', 'ok');
      await loadTrustViewData();
    } else {
      toast(res.error || 'Failed to record endorsement', 'err');
    }
  },

  // Request Skill Verification Modal
  openVerificationModal() {
    openModal('Request Official Skill Verification', `
      <form onsubmit="event.preventDefault(); HubActions.handleVerificationSubmit(this);">
        <p class="text-sm muted mb-3">Earn the official <b>🛡️ Verified by SkillSwap</b> shield and +15 trust points by submitting verifiable proof of your skill to moderators.</p>

        <label>
          <span>Skill Name</span>
          <input name="skill" required placeholder="e.g. Web Development, Machine Learning, UI/UX">
        </label>

        <label>
          <span>Skill Category</span>
          <select name="category">
            <option value="Programming">Programming &amp; Software</option>
            <option value="Graphic Design">Design &amp; UI/UX</option>
            <option value="Data & AI">Data &amp; AI</option>
            <option value="Public Speaking">Communication &amp; Public Speaking</option>
            <option value="General">General</option>
          </select>
        </label>

        <label>
          <span>Evidence URL (GitHub repo, live deployment, design portfolio, or publication)</span>
          <input type="url" name="evidenceUrl" required placeholder="https://github.com/your-username/repo">
        </label>

        <label>
          <span>Verification Notes / Summary of Evidence</span>
          <textarea name="notes" rows="3" placeholder="Explain your contribution, project scope, architecture, or test results..."></textarea>
        </label>

        <button class="btn primary block glow mt-3" type="submit">Submit for Moderator Review</button>
      </form>
    `);
  },

  async handleVerificationSubmit(form) {
    const skill = form.skill.value.trim();
    const category = form.category.value;
    const evidenceUrl = form.evidenceUrl.value.trim();
    const notes = form.notes.value.trim();

    const res = await api('/api/verifications', {
      method: 'POST',
      body: { skill, category, evidenceUrl, notes }
    });

    if (res.success) {
      closeModal();
      toast('🛡️ Verification request submitted to moderators (Status: Pending)', 'ok');
      await loadTrustViewData();
    } else {
      toast(res.error || 'Verification request failed', 'err');
    }
  },

  // Moderation Actions
  modTabSwitch(el) {
    $$('.tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const isVerif = el.dataset.tab === 'verifications';
    document.getElementById('modVerificationsSection').classList.toggle('hidden', !isVerif);
    document.getElementById('modReportsSection').classList.toggle('hidden', isVerif);
  },

  async approveVerification(el) {
    const id = el.dataset.id;
    const reviewerNotes = prompt('Optional approval feedback or verification summary note:') || 'Verified documentation and evidence.';
    const res = await api(`/api/verifications/${id}`, {
      method: 'PATCH',
      body: { status: 'approved', reviewerNotes }
    });

    if (res.success) {
      toast('Verification APPROVED! Applicant trust score updated.', 'ok');
      const row = document.getElementById(`verif-row-${id}`);
      if (row) row.remove();
    } else {
      toast(res.error || 'Approval failed', 'err');
    }
  },

  async rejectVerification(el) {
    const id = el.dataset.id;
    const reviewerNotes = prompt('Reason for rejection:') || 'Evidence insufficient or unverified.';
    const res = await api(`/api/verifications/${id}`, {
      method: 'PATCH',
      body: { status: 'rejected', reviewerNotes }
    });

    if (res.success) {
      toast('Verification rejected.', 'err');
      const row = document.getElementById(`verif-row-${id}`);
      if (row) row.remove();
    } else {
      toast(res.error || 'Rejection failed', 'err');
    }
  },

  async resolveReportTakeAction(el) {
    const id = el.dataset.id;
    if (!confirm('Resolve report and remove the offending content?')) return;
    const res = await api(`/api/reports/${id}`, {
      method: 'PATCH',
      body: { status: 'resolved', takeAction: true, resolutionNotes: 'Content violated community rules and was removed.' }
    });
    if (res.success) {
      toast('Report resolved and content removed.', 'ok');
      const row = document.getElementById(`report-row-${id}`);
      if (row) row.remove();
    }
  },

  async dismissReport(el) {
    const id = el.dataset.id;
    const res = await api(`/api/reports/${id}`, {
      method: 'PATCH',
      body: { status: 'dismissed', resolutionNotes: 'No policy violation found.' }
    });
    if (res.success) {
      toast('Report dismissed.', 'ok');
      const row = document.getElementById(`report-row-${id}`);
      if (row) row.remove();
    }
  },

  // Reporting Modal
  openReportModal(el) {
    const targetType = el.dataset.type;
    const targetId = el.dataset.id;

    openModal('Report Flagged Content', `
      <form onsubmit="event.preventDefault(); HubActions.handleReportSubmit(this, '${targetType}', '${targetId}');">
        <p class="text-sm muted mb-3">Reports are submitted confidentially to SkillSwap moderators. Please specify the issue.</p>

        <label>
          <span>Violation Reason</span>
          <select name="reason">
            <option value="Spam or advertising">Spam or advertising</option>
            <option value="Misleading or inaccurate content">Misleading or inaccurate technical advice</option>
            <option value="Harassment or inappropriate language">Harassment or unprofessional conduct</option>
            <option value="Plagiarism or uncredited code">Plagiarism or copyright infringement</option>
            <option value="Other">Other policy infraction</option>
          </select>
        </label>

        <label>
          <span>Specific Details / Explanation</span>
          <textarea name="details" rows="3" required placeholder="Describe what violated community guidelines..."></textarea>
        </label>

        <button class="btn danger block glow mt-3" type="submit">Submit Confidential Report</button>
      </form>
    `);
  },

  async handleReportSubmit(form, targetType, targetId) {
    const reason = form.reason.value;
    const details = form.details.value.trim();

    const res = await api('/api/reports', {
      method: 'POST',
      body: { targetType, targetId, reason, details }
    });

    if (res.success) {
      closeModal();
      toast('Thank you. Your report was submitted for moderator review.', 'ok');
    } else {
      toast(res.error || 'Failed to submit report', 'err');
    }
  },

  // Phase 5: Session Actions
  async openScheduleSessionModal(partnerId = null, prefillSkill = '') {
    const usersRes = await api('/api/auth/users');
    const peers = (usersRes.users || []).filter(u => u.email !== me.email);

    openModal('Schedule Learning Session', `
      <form data-form="createSession">
        <label>
          <span>Exchange Partner</span>
          <select name="partnerId" required>
            <option value="">Select a community peer...</option>
            ${peers.map(p => `<option value="${p.id}" ${partnerId && partnerId.toString() === p.id.toString() ? 'selected' : ''}>${esc(p.name)} (${esc(p.institution || p.role)})</option>`).join('')}
          </select>
        </label>

        <label>
          <span>Skill to Learn / Exchange</span>
          <input name="skill" required placeholder="e.g. Web Development, UI/UX, Python" value="${esc(prefillSkill)}">
        </label>

        <div class="row2">
          <label>
            <span>Session Date</span>
            <input type="date" name="date" required min="${new Date().toISOString().slice(0, 10)}" value="${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}">
          </label>
          <label>
            <span>Time</span>
            <input type="time" name="time" required value="18:00">
          </label>
        </div>

        <div class="row2">
          <label>
            <span>Duration</span>
            <select name="duration">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60" selected>60 minutes (Standard)</option>
              <option value="90">90 minutes</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <select name="category">
              <option value="Programming">Programming</option>
              <option value="Design">Design</option>
              <option value="Communication">Communication</option>
              <option value="Soft Skills">Soft Skills</option>
              <option value="General">General</option>
            </select>
          </label>
        </div>

        <label>
          <span>Session Goals &amp; Agenda</span>
          <textarea name="message" rows="3" placeholder="What specific topics or outcomes would you like to cover?"></textarea>
        </label>

        <div id="sessionBookingError" class="text-xs text-danger mb-2 hidden"></div>

        <button class="btn primary block glow mt-3" type="submit">Send Learning Request</button>
      </form>
    `);

    const form = document.querySelector('[data-form="createSession"]');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('sessionBookingError');
        if (errEl) errEl.classList.add('hidden');

        const body = {
          partnerId: form.partnerId.value,
          skill: form.skill.value.trim(),
          date: form.date.value,
          time: form.time.value,
          duration: Number(form.duration.value) || 60,
          category: form.category.value,
          message: form.message.value.trim()
        };

        const res = await api('/api/sessions/request', { method: 'POST', body });
        if (res.success) {
          closeModal();
          toast('Learning session request sent! Partner has been notified.', 'ok');
          if (location.hash === '#sessions') {
            after.sessions();
          } else if (location.hash === '#dashboard') {
            after.dashboard();
          }
        } else {
          if (errEl) {
            errEl.textContent = res.error || 'Failed to request session.';
            errEl.classList.remove('hidden');
          } else {
            toast(res.error || 'Failed to request session', 'err');
          }
        }
      };
    }
  },

  async acceptSession(sessionId) {
    const res = await api(`/api/sessions/${sessionId}/accept`, { method: 'PATCH' });
    if (res.success) {
      toast('Session accepted and confirmed on your schedule!', 'ok');
      after.sessions();
    } else {
      toast(res.error || 'Failed to accept session', 'err');
    }
  },

  async rejectSession(sessionId) {
    if (!confirm('Decline this learning request?')) return;
    const res = await api(`/api/sessions/${sessionId}/reject`, { method: 'PATCH' });
    if (res.success) {
      toast('Session request declined.', 'ok');
      after.sessions();
    } else {
      toast(res.error || 'Failed to decline session', 'err');
    }
  },

  async cancelSession(sessionId) {
    const reason = prompt('Please enter a cancellation reason:');
    if (reason === null) return;
    const res = await api(`/api/sessions/${sessionId}/cancel`, {
      method: 'PATCH',
      body: { cancelReason: reason.trim() }
    });
    if (res.success) {
      toast('Session cancelled.', 'ok');
      after.sessions();
    } else {
      toast(res.error || 'Failed to cancel session', 'err');
    }
  },

  async completeSession(sessionId) {
    if (!confirm('Mark this learning session as completed? Both participants will receive learning activity credit, and you can write a peer review.')) return;
    const res = await api(`/api/sessions/${sessionId}/complete`, { method: 'PATCH' });
    if (res.success) {
      toast('Session marked completed! You can now write a peer review.', 'ok');
      triggerConfetti();
      after.sessions();
    } else {
      toast(res.error || 'Failed to complete session', 'err');
    }
  },

  // Phase 6: Live Chat Actions
  async openChatWith(partnerId) {
    const res = await api('/api/conversations', {
      method: 'POST',
      body: { partnerId }
    });
    if (res.success && res.conversation) {
      location.hash = '#messages';
      setTimeout(() => {
        HubActions.selectConversation(res.conversation.id);
      }, 50);
    } else {
      toast(res.error || 'Failed to open conversation', 'err');
    }
  },

  async selectConversation(convId) {
    HubState.activeConvId = convId;
    document.querySelectorAll('.chat-conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === convId);
    });

    const msgsRes = await api(`/api/conversations/${convId}/messages`);
    const chatContainer = document.getElementById('chatMessagesContainer');
    const headerTitle = document.getElementById('chatActivePartnerName');
    const partnerEl = document.querySelector(`.chat-conv-item[data-id="${convId}"]`);

    if (headerTitle && partnerEl) {
      headerTitle.textContent = partnerEl.dataset.name || 'Conversation';
    }

    if (HubState.socket) {
      HubState.socket.emit('join:conversation', convId);
    }

    if (chatContainer) {
      if (!msgsRes.messages || msgsRes.messages.length === 0) {
        chatContainer.innerHTML = `<div class="empty text-center py-5"><span class="empty-icon">💬</span><div>No messages in this conversation yet. Say hello and introduce what you want to learn!</div></div>`;
      } else {
        chatContainer.innerHTML = msgsRes.messages.map(m => {
          const isMine = m.sender && (m.sender.id === me.mongoId || m.sender.name === me.name);
          return `
            <div class="chat-bubble-wrap ${isMine ? 'mine' : 'theirs'}">
              <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">${esc(m.text)}</div>
              <span class="chat-time">${new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          `;
        }).join('');
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
  },

  async sendChatMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chatTextInput');
    if (!input || !input.value.trim() || !HubState.activeConvId) return;

    const text = input.value.trim();
    input.value = '';

    const res = await api(`/api/conversations/${HubState.activeConvId}/messages`, {
      method: 'POST',
      body: { text }
    });

    if (res.success && res.message) {
      const chatContainer = document.getElementById('chatMessagesContainer');
      if (chatContainer) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble-wrap mine';
        bubble.innerHTML = `
          <div class="chat-bubble mine">${esc(res.message.text)}</div>
          <span class="chat-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        chatContainer.appendChild(bubble);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    } else {
      toast(res.error || 'Failed to send message', 'err');
    }
  },

  // Phase 1: Edit Profile Actions
  async openEditProfileModal() {
    const res = await api('/api/auth/me');
    const u = res.user || me;

    openModal('Edit My Skill Profile', `
      <form data-form="editProfile">
        <label>
          <span>Full Name</span>
          <input name="name" required value="${esc(u.name || '')}">
        </label>
        <div class="row2">
          <label>
            <span>Role / Persona</span>
            <select name="role">
              <option value="Student" ${u.role === 'Student' ? 'selected' : ''}>Student</option>
              <option value="Professional" ${u.role === 'Professional' ? 'selected' : ''}>Professional</option>
            </select>
          </label>
          <label>
            <span>Institution / Organization</span>
            <input name="institution" value="${esc(u.institution || '')}" placeholder="e.g. Stanford University">
          </label>
        </div>
        <div class="row2">
          <label>
            <span>Education Degree</span>
            <input name="education" value="${esc(u.education || '')}" placeholder="e.g. B.Tech Computer Science">
          </label>
          <label>
            <span>Location</span>
            <input name="location" value="${esc(u.location || '')}" placeholder="e.g. Chennai, India">
          </label>
        </div>
        <label>
          <span>Bio / About Me</span>
          <textarea name="bio" rows="2" placeholder="Tell peers about your background and passion...">${esc(u.bio || '')}</textarea>
        </label>
        <label>
          <span>Interests (Comma separated)</span>
          <input name="interests" value="${esc(u.interests || '')}" placeholder="e.g. React, Node.js, AI/ML, Design Systems">
        </label>
        <label>
          <span>Availability</span>
          <input name="availability" value="${esc((u.availability || []).join(', '))}" placeholder="e.g. Weekday Evenings, Weekends">
        </label>
        <label>
          <span>Preferred Learning Methods</span>
          <input name="preferredMethods" value="${esc((u.preferredMethods || []).join(', '))}" placeholder="e.g. 1-on-1 Session, Project Review, Pair Programming">
        </label>
        <button class="btn primary block glow mt-3" type="submit">Save Profile to MongoDB</button>
      </form>
    `);

    const form = document.querySelector('[data-form="editProfile"]');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const body = {
          name: form.name.value.trim(),
          role: form.role.value,
          institution: form.institution.value.trim(),
          education: form.education.value.trim(),
          location: form.location.value.trim(),
          bio: form.bio.value.trim(),
          interests: form.interests.value.trim(),
          availability: form.availability.value.split(',').map(s => s.trim()).filter(Boolean),
          preferredMethods: form.preferredMethods.value.split(',').map(s => s.trim()).filter(Boolean)
        };
        const updateRes = await api('/api/auth/profile', { method: 'PUT', body });
        if (updateRes.success) {
          closeModal();
          toast('Profile updated successfully in MongoDB!', 'ok');
          if (updateRes.user) {
            me.name = updateRes.user.name;
            me.role = updateRes.user.role;
            me.institution = updateRes.user.institution;
            updateUserChrome();
          }
          if (location.hash === '#profile') after.profile();
          else if (location.hash === '#dashboard') after.dashboard();
        } else {
          toast(updateRes.error || 'Failed to update profile', 'err');
        }
      };
    }
  },

  // Add Skill Modal
  async openAddSkillModal(type = 'teach') {
    openModal(type === 'teach' ? 'Add Skill I Can Teach' : 'Add Skill I Want to Learn', `
      <form data-form="addSkillModalForm">
        <label>
          <span>Skill Name</span>
          <input name="name" required placeholder="e.g. React, Python, UI/UX, Public Speaking">
        </label>
        <div class="row2">
          <label>
            <span>Category</span>
            <select name="category">
              <option value="Programming">Programming</option>
              <option value="Design">Design</option>
              <option value="Communication">Communication</option>
              <option value="Artificial Intelligence">Artificial Intelligence</option>
              <option value="Writing">Writing</option>
              <option value="General">General</option>
            </select>
          </label>
          <label>
            <span>Proficiency Level</span>
            <select name="level">
              <option value="Beginner">Beginner</option>
              <option value="Intermediate" selected>Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="Expert">Expert</option>
            </select>
          </label>
        </div>
        ${type === 'teach' ? `
          <label>
            <span>Exchange Format</span>
            <select name="format">
              <option value="1-on-1 Session">1-on-1 Session</option>
              <option value="Project Review">Project Review</option>
              <option value="Code Review">Code Review</option>
              <option value="Pair Programming">Pair Programming</option>
            </select>
          </label>
        ` : ''}
        <label>
          <span>Description / Notes</span>
          <textarea name="description" rows="2" placeholder="What specific topics or tools are involved?"></textarea>
        </label>
        <button class="btn primary block glow mt-3" type="submit">Save Skill</button>
      </form>
    `);

    const form = document.querySelector('[data-form="addSkillModalForm"]');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const myRes = await api('/api/auth/me');
        const user = myRes.user || {};
        const offered = user.skillsOffered || [];
        const wanted = user.skillsWanted || [];

        const newSkill = {
          name: form.name.value.trim(),
          category: form.category.value,
          level: form.level.value,
          description: form.description.value.trim()
        };

        if (type === 'teach') {
          newSkill.format = form.format ? form.format.value : '1-on-1 Session';
          offered.push(newSkill);
        } else {
          wanted.push(newSkill);
        }

        const updateRes = await api('/api/auth/profile', {
          method: 'PUT',
          body: { skillsOffered: offered, skillsWanted: wanted }
        });

        if (updateRes.success) {
          closeModal();
          toast(`Skill "${newSkill.name}" saved to your profile!`, 'ok');
          if (location.hash === '#dashboard') after.dashboard();
          else if (location.hash === '#profile') after.profile();
        } else {
          toast(updateRes.error || 'Failed to save skill', 'err');
        }
      };
    }
  },

  // Phase 8: Goal Actions
  async openNewGoalModal() {
    openModal('Set New Learning Goal', `
      <form data-form="createGoalForm">
        <label>
          <span>Goal Title</span>
          <input name="title" required placeholder="e.g. Build Full-Stack Portfolio, Master Figma Tokens">
        </label>
        <div class="row2">
          <label>
            <span>Target Skill</span>
            <input name="skill" required placeholder="e.g. Web Development, UI/UX">
          </label>
          <label>
            <span>Target Completion Date</span>
            <input type="date" name="targetDate" min="${new Date().toISOString().slice(0, 10)}">
          </label>
        </div>
        <label>
          <span>Milestones (One per line)</span>
          <textarea name="milestones" rows="3" placeholder="1. Complete core architecture\n2. Rehearse pitch with mentor\n3. Deploy live production project"></textarea>
        </label>
        <button class="btn primary block glow mt-3" type="submit">Create Goal</button>
      </form>
    `);

    const form = document.querySelector('[data-form="createGoalForm"]');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const rawMilestones = form.milestones.value.split('\n').map(s => s.trim()).filter(Boolean);
        const milestones = rawMilestones.map(text => ({ text, done: false }));
        const body = {
          title: form.title.value.trim(),
          skill: form.skill.value.trim(),
          targetDate: form.targetDate.value || null,
          progress: 0,
          milestones
        };

        const res = await api('/api/goals', { method: 'POST', body });
        if (res.success) {
          closeModal();
          toast('Learning goal saved!', 'ok');
          if (location.hash === '#analytics') after.analytics();
          else if (location.hash === '#dashboard') after.dashboard();
        } else {
          toast(res.error || 'Failed to save goal', 'err');
        }
      };
    }
  },

  async toggleMilestone(goalId, milestoneIndex) {
    const goalsRes = await api('/api/goals');
    const goal = (goalsRes.goals || []).find(g => g._id === goalId);
    if (!goal || !goal.milestones || !goal.milestones[milestoneIndex]) return;

    goal.milestones[milestoneIndex].done = !goal.milestones[milestoneIndex].done;
    const completedCount = goal.milestones.filter(m => m.done).length;
    const progress = Math.round((completedCount / goal.milestones.length) * 100);

    const res = await api(`/api/goals/${goalId}`, {
      method: 'PATCH',
      body: { milestones: goal.milestones, progress }
    });

    if (res.success) {
      if (progress === 100) triggerConfetti();
      if (location.hash === '#analytics') after.analytics();
      else if (location.hash === '#dashboard') after.dashboard();
    }
  },

  async markNotificationRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
    if (location.hash === '#notifications') after.notifications();
  },

  async markAllNotificationsRead() {
    const res = await api('/api/notifications/read-all', { method: 'POST' });
    if (res.success) {
      toast('All notifications marked read.', 'ok');
      after.notifications();
    }
  }
};

/* =====================================================================
   CONNECTED VIEW DEFINITIONS (PHASES 2, 3, 5, 6, 8, 10)
   ===================================================================== */

// VIEW: DASHBOARD (Phase 2)
views.dashboard = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2 style="font-family: var(--font-heading); font-size: 24px; font-weight: 700;">Personalized Learning Dashboard</h2>
        <p class="muted text-sm">Real-time snapshot of your skill exchanges, matches, sessions, and learning momentum.</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn primary sm glow" data-action="openScheduleSessionModal">📅 Schedule Session</button>
        <button class="btn sm" data-action="openAddSkillModal" data-type="teach">+ Teach Skill</button>
        <button class="btn sm" data-action="openNewGoalModal">🎯 New Goal</button>
      </div>
    </div>
  </div>
  <div id="dashContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Loading your personalized dashboard from MongoDB...</div></div></div>
`;

after.dashboard = async () => {
  const container = document.getElementById('dashContainer');
  if (!container) return;

  const res = await api('/api/dashboard/summary');
  if (!res.success || !res.dashboard) {
    container.innerHTML = `<div class="empty text-danger"><span class="empty-icon">⚠️</span><div>${esc(res.error || 'Failed to load dashboard from MongoDB.')}</div></div>`;
    return;
  }

  const d = res.dashboard;
  const user = d.user;
  const trust = d.trustStats;

  container.innerHTML = `
    <!-- Top Welcome Banner -->
    <div class="card mb-4" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%); border-color: rgba(99, 102, 241, 0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 16px;">
          ${avatar(user.name, 'lg')}
          <div>
            <h2 style="font-size: 22px; font-weight: 700;">Welcome back, ${esc(user.name.split(' ')[0])}!</h2>
            <p class="muted mb-1">${esc(user.role)} at <b>${esc(user.institution || 'SkillSwap Network')}</b></p>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span class="verified-shield">${trust.badge || '🛡️'} ${esc(trust.tier || 'Verified Peer')}</span>
              <span class="text-xs muted">·</span>
              <span class="text-xs font-semibold" style="color: var(--primary);">Trust Score: ${trust.score}/100</span>
              <span class="text-xs muted">·</span>
              <span class="text-xs muted">⏱️ ${trust.totalHours}h Learning Time</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#sessions" class="btn sm primary glow">View Sessions (${d.upcomingSessions.length})</a>
          <a href="#matches" class="btn sm">Find Learning Partners</a>
        </div>
      </div>
    </div>

    <!-- Stat Metrics Grid -->
    <div class="grid g4 mb-4">
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Skills Offered</span><span class="stat-icon">🎓</span></div>
        <div class="stat-val">${d.skillsCanTeach.length}</div>
        <div class="stat-sub muted">Ready to share</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Skills Wanted</span><span class="stat-icon">🌱</span></div>
        <div class="stat-val">${d.skillsWantToLearn.length}</div>
        <div class="stat-sub muted">Active learning interests</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Upcoming Sessions</span><span class="stat-icon">📅</span></div>
        <div class="stat-val">${d.upcomingSessions.length}</div>
        <div class="stat-sub muted">${d.upcomingSessions.filter(s => s.status === 'pending').length} pending approval</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Trust Score</span><span class="stat-icon">🛡️</span></div>
        <div class="stat-val" style="color: var(--teach);">${trust.score}/100</div>
        <div class="stat-sub muted">${trust.completedSessions} verified sessions</div>
      </div>
    </div>

    <!-- 2 Column Section: Skills Portfolio & Upcoming Sessions -->
    <div class="grid g2 mb-4">
      <!-- Skills Portfolio -->
      <div class="card">
        <div class="card-head">
          <h3>🎓 My Skill Portfolio</h3>
          <button class="btn sm" onclick="HubActions.openAddSkillModal('teach')">+ Add Skill</button>
        </div>
        <div class="mb-3">
          <span class="text-xs font-bold uppercase muted">Skills I Can Teach:</span>
          <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px;">
            ${d.skillsCanTeach.length ? d.skillsCanTeach.map(s => `
              <span class="chip teach" title="${esc(s.category)} · ${esc(s.level)}">
                🎓 <b>${esc(s.name)}</b> <small>(${esc(s.level)})</small>
              </span>
            `).join('') : '<div class="text-xs muted py-2">No skills listed to teach yet. Click "+ Add Skill" above!</div>'}
          </div>
        </div>
        <div>
          <span class="text-xs font-bold uppercase muted">Skills I Want to Learn:</span>
          <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px;">
            ${d.skillsWantToLearn.length ? d.skillsWantToLearn.map(s => `
              <span class="chip learn" title="${esc(s.category)}">
                🌱 <b>${esc(s.name)}</b> <small>(${esc(s.level)})</small>
              </span>
            `).join('') : '<div class="text-xs muted py-2">No learning targets added yet.</div>'}
          </div>
        </div>
      </div>

      <!-- Upcoming Sessions -->
      <div class="card">
        <div class="card-head">
          <h3>📅 Upcoming Learning Sessions</h3>
          <a href="#sessions" class="text-xs font-semibold">View All (${d.upcomingSessions.length}) →</a>
        </div>
        ${d.upcomingSessions.length ? d.upcomingSessions.map(s => `
          <div class="session-card" style="padding: 12px 14px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <b>${esc(s.skill)}</b>
              <span class="session-status-badge status-${s.status}">${s.status}</span>
            </div>
            <div class="text-xs muted">
              👤 With <b>${esc(s.partner?.name || 'Peer')}</b> (${esc(s.myRole)}) · 🕒 ${new Date(s.date).toLocaleDateString()} at ${esc(s.time)} (${s.minutes}m)
            </div>
          </div>
        `).join('') : '<div class="empty text-center py-4"><span class="empty-icon">📅</span><div class="text-sm muted">No upcoming sessions scheduled.<br><a href="javascript:void(0)" onclick="HubActions.openScheduleSessionModal()" class="text-xs font-bold" style="color: var(--primary);">Schedule a session now →</a></div></div>'}
      </div>
    </div>

    <!-- Recommended Partners -->
    <div class="card mb-4">
      <div class="card-head">
        <div>
          <h3>🤝 Recommended Learning Partners (Smart Match)</h3>
          <p class="muted text-xs">Algorithmic matches comparing your skills offered vs wanted with schedule compatibility.</p>
        </div>
        <a href="#matches" class="text-xs font-semibold">View All Matches →</a>
      </div>
      <div class="grid g2">
        ${d.recommendedPartners.length ? d.recommendedPartners.map(m => `
          <div class="match-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="display: flex; align-items: center; gap: 12px;">
                ${avatar(m.candidate.name, 'sm')}
                <div>
                  <b>${esc(m.candidate.name)}</b>
                  <div class="text-xs muted">${esc(m.candidate.institution || m.candidate.role)}</div>
                </div>
              </div>
              <span class="match-score-badge">${m.score}% Match</span>
            </div>
            <ul class="match-reasons-list">
              ${m.reasons.slice(0, 2).map(r => `<li>✨ ${esc(r)}</li>`).join('')}
            </ul>
            <div style="display: flex; gap: 8px; margin-top: auto;">
              <button class="btn sm primary glow" onclick="HubActions.openScheduleSessionModal('${m.candidate.id}', '${esc(m.teachMatches[0]?.skill || m.learnMatches[0]?.skill || '')}')">Propose Session</button>
              <button class="btn sm" onclick="HubActions.openChatWith('${m.candidate.id}')">💬 Message</button>
            </div>
          </div>
        `).join('') : '<div class="empty"><span class="empty-icon">🤝</span><div>Add skills to your profile to discover compatible peers!</div></div>'}
      </div>
    </div>

    <!-- Active Learning Goals -->
    <div class="card mb-4">
      <div class="card-head">
        <h3>🎯 Learning Goals &amp; Progress</h3>
        <button class="btn sm" onclick="HubActions.openNewGoalModal()">+ New Goal</button>
      </div>
      ${d.learningGoals.length ? d.learningGoals.map(g => `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span class="font-semibold text-sm">🎯 ${esc(g.title)} <span class="muted text-xs">(${esc(g.skill)})</span></span>
            <span class="text-xs font-bold" style="color: var(--primary);">${g.progress || 0}% Completed</span>
          </div>
          <div class="bar bar-sm xp-bar"><i style="width: ${g.progress || 0}%;"></i></div>
        </div>
      `).join('') : '<div class="text-xs muted py-2">No active learning goals yet. Click "+ New Goal" to set milestones!</div>'}
    </div>
  `;
};

// VIEW: DISCOVER SKILLS (Phase 10 & 2)
views.discover = () => `
  <div class="view-header mb-4">
    <h2>🔍 Discover Community Skills</h2>
    <p class="muted text-sm">Explore what fellow community members are teaching and looking to learn.</p>
  </div>
  <div class="hub-toolbar mb-4">
    <div class="hub-search-row">
      <div class="hub-search-input">
        <span class="hub-search-icon">🔍</span>
        <input type="text" id="discoverSearchInput" placeholder="Search members by skill or name (e.g. React, Python, UI/UX)..." oninput="HubActions.handleDiscoverSearch(this.value)">
      </div>
    </div>
  </div>
  <div id="discoverContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Loading community directory from MongoDB...</div></div></div>
`;

after.discover = async () => {
  const container = document.getElementById('discoverContainer');
  if (!container) return;
  const res = await api('/api/auth/users');
  HubState.allUsers = res.users || [];
  HubActions.renderDiscoverUsers(HubState.allUsers);
};

HubActions.renderDiscoverUsers = (users) => {
  const container = document.getElementById('discoverContainer');
  if (!container) return;

  const filtered = users.filter(u => u.email !== me.email);
  if (!filtered.length) {
    container.innerHTML = `<div class="empty"><span class="empty-icon">👥</span><div>No members found matching your search.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid g2">
      ${filtered.map(u => `
        <div class="card" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${avatar(u.name, 'sm')}
              <div>
                <b>${esc(u.name)}</b>
                <div class="text-xs muted">${esc(u.institution || u.role)} ${u.location ? `· 📍 ${esc(u.location)}` : ''}</div>
              </div>
            </div>
            <span class="level-chip">${esc(u.role)}</span>
          </div>
          ${u.bio ? `<p class="text-xs muted" style="line-height: 1.4;">${esc(u.bio)}</p>` : ''}
          <div>
            <span class="text-xs font-bold uppercase muted">Teaches:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
              ${(u.skillsOffered || []).length ? (u.skillsOffered || []).map(s => `<span class="chip teach text-xs">🎓 ${esc(s.name)}</span>`).join('') : '<span class="text-xs muted">None listed</span>'}
            </div>
          </div>
          <div>
            <span class="text-xs font-bold uppercase muted">Wants to learn:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
              ${(u.skillsWanted || []).length ? (u.skillsWanted || []).map(s => `<span class="chip learn text-xs">🌱 ${esc(s.name)}</span>`).join('') : '<span class="text-xs muted">None listed</span>'}
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: auto; padding-top: 8px;">
            <button class="btn sm primary glow" onclick="HubActions.openScheduleSessionModal('${u.id}')">📅 Propose Swap</button>
            <button class="btn sm" onclick="HubActions.openChatWith('${u.id}')">💬 Message</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

HubActions.handleDiscoverSearch = (query) => {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    HubActions.renderDiscoverUsers(HubState.allUsers);
    return;
  }
  const filtered = (HubState.allUsers || []).filter(u => {
    const nameMatch = (u.name || '').toLowerCase().includes(q);
    const teachMatch = (u.skillsOffered || []).some(s => (s.name || '').toLowerCase().includes(q));
    const learnMatch = (u.skillsWanted || []).some(s => (s.name || '').toLowerCase().includes(q));
    return nameMatch || teachMatch || learnMatch;
  });
  HubActions.renderDiscoverUsers(filtered);
};

// VIEW: LEARNING PARTNERS / SMART MATCHES (Phase 3)
views.matches = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2>🤝 Smart Skill Matches &amp; Learning Partners</h2>
        <p class="muted text-sm">Algorithmic partner matching with explainable compatibility scores and reciprocal exchange reasons.</p>
      </div>
      <button class="btn primary sm glow" onclick="HubActions.openScheduleSessionModal()">📅 Schedule Session</button>
    </div>
  </div>
  <div id="matchesViewContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Calculating reciprocal matches from MongoDB...</div></div></div>
`;

after.matches = async () => {
  const container = document.getElementById('matchesViewContainer');
  if (!container) return;

  const res = await api('/api/matches');
  if (!res.success || !res.matches) {
    container.innerHTML = `<div class="empty text-danger"><span class="empty-icon">⚠️</span><div>${esc(res.error || 'Failed to calculate matches.')}</div></div>`;
    return;
  }

  if (res.matches.length === 0) {
    container.innerHTML = `<div class="empty"><span class="empty-icon">👥</span><div>No matching peers found yet. Add more skills to your profile to discover partners!</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid g2">
      ${res.matches.map(m => `
        <div class="match-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              ${avatar(m.candidate.name, 'sm')}
              <div>
                <b>${esc(m.candidate.name)}</b>
                <div class="text-xs muted">${esc(m.candidate.institution || m.candidate.role)}</div>
              </div>
            </div>
            <span class="match-score-badge">${m.score}% Compatibility</span>
          </div>

          <ul class="match-reasons-list">
            ${m.reasons.map(r => `<li>✨ ${esc(r)}</li>`).join('')}
          </ul>

          <div class="row2">
            <div>
              <span class="text-xs font-bold uppercase muted">You can teach them:</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                ${m.teachMatches.length ? m.teachMatches.map(t => `<span class="chip teach text-xs">🎓 ${esc(t.skill)}</span>`).join('') : '<span class="text-xs muted">Open exploration</span>'}
              </div>
            </div>
            <div>
              <span class="text-xs font-bold uppercase muted">They can teach you:</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                ${m.learnMatches.length ? m.learnMatches.map(l => `<span class="chip learn text-xs">🌱 ${esc(l.skill)}</span>`).join('') : '<span class="text-xs muted">Open exploration</span>'}
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; margin-top: auto; padding-top: 10px;">
            <button class="btn sm primary glow" onclick="HubActions.openScheduleSessionModal('${m.candidate.id}', '${esc(m.teachMatches[0]?.skill || m.learnMatches[0]?.skill || '')}')">📅 Request Session</button>
            <button class="btn sm" onclick="HubActions.openChatWith('${m.candidate.id}')">💬 Message</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

// VIEW: MY LEARNING SESSIONS (Phase 5)
views.sessions = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2>📅 My Learning Sessions</h2>
        <p class="muted text-sm">Schedule, confirm, reschedule, and track completed peer knowledge exchange sessions.</p>
      </div>
      <button class="btn primary sm glow" onclick="HubActions.openScheduleSessionModal()">+ Schedule New Session</button>
    </div>
  </div>
  <div class="tabs mb-4">
    <button class="tab active" data-action="filterSessionsTab" data-status="all">All Sessions</button>
    <button class="tab" data-action="filterSessionsTab" data-status="pending">Pending Requests</button>
    <button class="tab" data-action="filterSessionsTab" data-status="accepted">Upcoming / Accepted</button>
    <button class="tab" data-action="filterSessionsTab" data-status="completed">Completed</button>
    <button class="tab" data-action="filterSessionsTab" data-status="cancelled">Cancelled</button>
  </div>
  <div id="sessionsListContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Loading your sessions from MongoDB...</div></div></div>
`;

after.sessions = async (statusFilter = 'all') => {
  const container = document.getElementById('sessionsListContainer');
  if (!container) return;

  const url = statusFilter && statusFilter !== 'all' ? `/api/sessions?status=${statusFilter}` : '/api/sessions';
  const res = await api(url);

  if (!res.success || !res.sessions) {
    container.innerHTML = `<div class="empty text-danger"><span class="empty-icon">⚠️</span><div>${esc(res.error || 'Failed to load sessions.')}</div></div>`;
    return;
  }

  if (res.sessions.length === 0) {
    container.innerHTML = `<div class="empty"><span class="empty-icon">📅</span><div>No sessions found for this filter. Schedule a session with a learning partner!</div></div>`;
    return;
  }

  container.innerHTML = res.sessions.map(s => {
    return `
      <div class="session-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
              <h4 style="font-size: 16px; font-weight: 700;">${esc(s.skill)}</h4>
              <span class="session-status-badge status-${s.status}">${s.status}</span>
              <span class="chip ${s.myRole === 'Mentor' ? 'teach' : 'learn'} text-xs">Role: ${s.myRole}</span>
            </div>
            <div class="text-xs muted">
              👤 Partner: <b>${esc(s.partner?.name || 'Peer')}</b> (${esc(s.partner?.institution || s.partner?.role || 'Member')})
              · 🕒 ${new Date(s.date).toLocaleDateString()} at ${esc(s.time)} (${s.minutes} mins)
            </div>
            ${s.message ? `<p class="text-xs text-muted mt-2" style="background: var(--bg-surface-elevated); padding: 8px 12px; border-radius: var(--radius-sm);">💬 "${esc(s.message)}"</p>` : ''}
            ${s.cancelReason ? `<p class="text-xs text-danger mt-2">Cancellation Reason: ${esc(s.cancelReason)}</p>` : ''}
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            ${s.status === 'pending' ? `
              <button class="btn sm primary glow" onclick="HubActions.acceptSession('${s.id}')">✓ Accept Request</button>
              <button class="btn sm danger" onclick="HubActions.rejectSession('${s.id}')">✕ Decline</button>
            ` : ''}

            ${s.status === 'accepted' ? `
              <button class="btn sm primary glow" onclick="HubActions.completeSession('${s.id}')">✓ Mark Completed</button>
              <button class="btn sm danger" onclick="HubActions.cancelSession('${s.id}')">Cancel</button>
            ` : ''}

            ${s.status === 'completed' ? `
              <a href="#trust" class="btn sm primary glow">⭐ Write Review &amp; Endorse</a>
            ` : ''}

            <button class="btn sm" onclick="HubActions.openChatWith('${s.partner?.id}')">💬 Chat</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

HubActions.filterSessionsTab = (e) => {
  const btn = e.target.closest('[data-status]');
  if (!btn) return;
  document.querySelectorAll('[data-action="filterSessionsTab"]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  after.sessions(btn.dataset.status);
};

// VIEW: MESSAGES / LIVE CHAT (Phase 6)
views.messages = () => `
  <div class="view-header mb-4">
    <h2>💬 Live 1-on-1 Chat</h2>
    <p class="muted text-sm">Real-time messaging between learning partners with live Socket.IO presence and typing indicators.</p>
  </div>
  <div class="chat-container">
    <div class="chat-sidebar">
      <div class="chat-sidebar-head">
        <span class="font-bold text-sm">Conversations</span>
        <button class="btn sm primary glow" onclick="HubActions.openNewChatModal()">+ New Chat</button>
      </div>
      <div class="chat-conv-list" id="chatConversationsList">
        <div class="text-xs muted p-3">Loading conversations...</div>
      </div>
    </div>
    <div class="chat-main">
      <div class="chat-main-head">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="status-dot pulse" style="background: #10b981;"></span>
          <b id="chatActivePartnerName">Select a conversation</b>
        </div>
      </div>
      <div class="chat-messages" id="chatMessagesContainer">
        <div class="empty text-center py-5"><span class="empty-icon">💬</span><div>Select a partner from the left or click "+ New Chat" to begin.</div></div>
      </div>
      <div class="chat-typing-banner" id="chatTypingBanner"></div>
      <form class="chat-input-bar" onsubmit="HubActions.sendChatMessage(event)">
        <input type="text" id="chatTextInput" placeholder="Type a message to your learning partner..." autocomplete="off">
        <button class="btn primary glow" type="submit">Send</button>
      </form>
    </div>
  </div>
`;

after.messages = async () => {
  const convList = document.getElementById('chatConversationsList');
  if (!convList) return;

  const res = await api('/api/conversations');
  if (!res.success || !res.conversations || res.conversations.length === 0) {
    convList.innerHTML = `<div class="text-xs muted p-3">No chat conversations yet. Click "+ New Chat" above!</div>`;
    return;
  }

  convList.innerHTML = res.conversations.map((c, i) => `
    <div class="chat-conv-item ${i === 0 ? 'active' : ''}" data-id="${c.id}" data-name="${esc(c.partner.name)}" onclick="HubActions.selectConversation('${c.id}')">
      ${avatar(c.partner.name, 'sm')}
      <div class="chat-conv-info">
        <div class="chat-conv-name">
          <span>${esc(c.partner.name)}</span>
          ${c.unreadCount ? `<span class="nav-badge">${c.unreadCount}</span>` : ''}
        </div>
        <div class="chat-conv-last">${esc(c.lastMessage || 'Started conversation')}</div>
      </div>
    </div>
  `).join('');

  if (res.conversations.length > 0) {
    HubActions.selectConversation(res.conversations[0].id);
  }
};

HubActions.openNewChatModal = async () => {
  const usersRes = await api('/api/auth/users');
  const peers = (usersRes.users || []).filter(u => u.email !== me.email);

  openModal('Start New Conversation', `
    <form data-form="startChatForm">
      <label>
        <span>Select Peer</span>
        <select name="partnerId" required>
          ${peers.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.institution || p.role)})</option>`).join('')}
        </select>
      </label>
      <button class="btn primary block glow mt-3" type="submit">Open Chat</button>
    </form>
  `);

  const form = document.querySelector('[data-form="startChatForm"]');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      closeModal();
      HubActions.openChatWith(form.partnerId.value);
    };
  }
};

// VIEW: NOTIFICATIONS (Phase 6 & 10)
views.notifications = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2>🔔 Notifications</h2>
        <p class="muted text-sm">Real-time alerts for learning requests, session changes, reviews, endorsements, and chat messages.</p>
      </div>
      <button class="btn sm" onclick="HubActions.markAllNotificationsRead()">Mark All as Read</button>
    </div>
  </div>
  <div id="notificationsContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Loading notifications...</div></div></div>
`;

after.notifications = async () => {
  const container = document.getElementById('notificationsContainer');
  if (!container) return;

  const res = await api('/api/notifications');
  if (!res.success || !res.notifications || res.notifications.length === 0) {
    container.innerHTML = `<div class="empty"><span class="empty-icon">🔔</span><div>You are all caught up! No notifications.</div></div>`;
    return;
  }

  container.innerHTML = res.notifications.map(n => `
    <div class="card mb-2" style="padding: 14px 18px; border-left: 3px solid ${n.isRead ? 'var(--line)' : 'var(--primary)'}; background: ${n.isRead ? 'var(--bg-surface)' : 'var(--bg-surface-elevated)'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div>
          <b>${esc(n.title)}</b>
          <p class="text-sm muted mt-1">${esc(n.message)}</p>
          <span class="text-xs muted">${new Date(n.createdAt).toLocaleString()}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          ${n.link ? `<a href="${n.link}" class="btn sm primary glow" onclick="HubActions.markNotificationRead('${n.id}')">View</a>` : ''}
          ${!n.isRead ? `<button class="btn sm ghost" onclick="HubActions.markNotificationRead('${n.id}')">Dismiss</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
};

// VIEW: LEARNING GOALS & ANALYTICS (Phase 8)
views.analytics = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2>📈 Learning Goals &amp; Analytics</h2>
        <p class="muted text-sm">Aggregated metrics on completed sessions, active learning streaks, skill distribution, and milestones.</p>
      </div>
      <button class="btn primary sm glow" onclick="HubActions.openNewGoalModal()">+ Set New Goal</button>
    </div>
  </div>
  <div id="analyticsContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Calculating MongoDB aggregation analytics...</div></div></div>
`;

after.analytics = async () => {
  const container = document.getElementById('analyticsContainer');
  if (!container) return;

  const [analyticsRes, goalsRes] = await Promise.all([
    api('/api/analytics'),
    api('/api/goals')
  ]);

  if (!analyticsRes.success || !analyticsRes.analytics) {
    container.innerHTML = `<div class="empty text-danger"><span class="empty-icon">⚠️</span><div>Failed to load analytics from MongoDB.</div></div>`;
    return;
  }

  const a = analyticsRes.analytics;
  const goals = goalsRes.goals || [];

  container.innerHTML = `
    <!-- Key Numbers -->
    <div class="grid g4 mb-4">
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Completed Sessions</span><span class="stat-icon">🎓</span></div>
        <div class="stat-val">${a.totalCompletedSessions}</div>
        <div class="stat-sub muted">${a.taughtCount} taught · ${a.learnedCount} learned</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Total Learning Hours</span><span class="stat-icon">⏱️</span></div>
        <div class="stat-val">${a.totalLearningHours}h</div>
        <div class="stat-sub muted">Persistent ledger hours</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Active Streak</span><span class="stat-icon">🔥</span></div>
        <div class="stat-val" style="color: var(--mutual);">${a.currentStreakDays} Days</div>
        <div class="stat-sub muted">Best record: ${a.longestStreakDays} days</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><span class="stat-lbl">Active Goals</span><span class="stat-icon">🎯</span></div>
        <div class="stat-val">${a.goalStats?.totalGoals || 0}</div>
        <div class="stat-sub muted">${a.goalStats?.completedMilestones || 0} milestones done</div>
      </div>
    </div>

    <!-- Active Learning Streak Tracker -->
    <div class="card mb-4">
      <div class="card-head">
        <div>
          <h3>🔥 Learning Days &amp; Consistency Ledger</h3>
          <p class="muted text-xs">Calculated strictly from distinct calendar days with completed sessions or verified learning activity logs.</p>
        </div>
        <span class="text-xs font-bold" style="color: var(--teach);">${a.activeLearningDaysCount} Total Active Days</span>
      </div>
      <div class="streak-days-grid">
        ${(a.distinctDays || []).map(day => `
          <div class="streak-day-dot active" title="Active Learning Day: ${day}">
            ✓
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Goals Milestone Checklist -->
    <div class="card mb-4">
      <div class="card-head">
        <h3>🎯 Learning Goals &amp; Milestone Checklist</h3>
        <button class="btn sm primary glow" onclick="HubActions.openNewGoalModal()">+ New Goal</button>
      </div>
      ${goals.length ? goals.map(g => `
        <div style="border-bottom: 1px solid var(--line); padding: 14px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <b style="font-size: 15px;">${esc(g.title)}</b>
              <span class="chip learn text-xs ml-2">${esc(g.skill)}</span>
            </div>
            <span class="text-xs font-bold" style="color: var(--primary);">${g.progress || 0}%</span>
          </div>
          <div class="bar bar-sm xp-bar mb-3"><i style="width: ${g.progress || 0}%;"></i></div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${(g.milestones || []).map((m, idx) => `
              <div class="milestone-item ${m.done ? 'done' : ''}" onclick="HubActions.toggleMilestone('${g._id}', ${idx})">
                <input type="checkbox" ${m.done ? 'checked' : ''} style="pointer-events: none;">
                <span>${esc(m.text)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('') : '<div class="text-xs muted py-3">No active learning goals yet. Click "+ Set New Goal" above!</div>'}
    </div>

    <!-- Community Top Shared Skills -->
    <div class="card mb-4">
      <div class="card-head">
        <h3>🌐 Community Most-Shared Skills</h3>
        <span class="text-xs muted">Aggregated across all members</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${(a.topCommunitySkills || []).map(sk => `
          <span class="tag-pill" style="font-size: 13px; padding: 6px 14px;">
            <b>${esc(sk.name)}</b> <small class="muted">(${sk.count} offers)</small>
          </span>
        `).join('')}
      </div>
    </div>
  `;
};

// VIEW: MY PROFILE (Phase 1 & 10)
views.profile = () => `
  <div class="view-header mb-4">
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
      <div>
        <h2>👤 My Skill Profile</h2>
        <p class="muted text-sm">Personal details, skills you teach, skills you want to learn, and availability settings.</p>
      </div>
      <button class="btn primary sm glow" onclick="HubActions.openEditProfileModal()">✏️ Edit Profile</button>
    </div>
  </div>
  <div id="profileContainer"><div class="empty"><span class="empty-icon">⏳</span><div>Loading your profile from MongoDB...</div></div></div>
`;

after.profile = async () => {
  const container = document.getElementById('profileContainer');
  if (!container) return;

  const res = await api('/api/auth/me');
  if (!res.success || !res.user) {
    container.innerHTML = `<div class="empty text-danger"><span class="empty-icon">⚠️</span><div>Failed to load profile.</div></div>`;
    return;
  }

  const u = res.user;

  container.innerHTML = `
    <div class="card mb-4">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 18px;">
          ${avatar(u.name, 'lg')}
          <div>
            <h3 style="font-size: 20px; font-weight: 700;">${esc(u.name)}</h3>
            <p class="muted text-sm mb-1">${esc(u.role)} · <b>${esc(u.institution || 'SkillSwap Member')}</b></p>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span class="verified-shield">${u.tierBadge || '🛡️'} ${esc(u.trustTier || 'Verified Peer')}</span>
              <span class="text-xs font-semibold" style="color: var(--primary);">Trust Score: ${u.trustScore || 0}/100</span>
              ${u.location ? `<span class="text-xs muted">· 📍 ${esc(u.location)}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn sm" onclick="HubActions.openEditProfileModal()">✏️ Edit Profile</button>
      </div>
      ${u.bio ? `<p class="text-sm mt-3 muted" style="line-height: 1.5;">${esc(u.bio)}</p>` : ''}
    </div>

    <div class="grid g2 mb-4">
      <div class="card">
        <div class="card-head">
          <h3>🎓 Skills I Can Teach</h3>
          <button class="btn sm" onclick="HubActions.openAddSkillModal('teach')">+ Add Skill</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(u.skillsOffered || []).length ? (u.skillsOffered || []).map(s => `
            <div style="padding: 10px 14px; background: var(--bg-surface-elevated); border-radius: var(--radius-sm); border: 1px solid var(--line);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <b>${esc(s.name)}</b>
                <span class="chip teach text-xs">${esc(s.level)}</span>
              </div>
              <div class="text-xs muted mt-1">${esc(s.category)} · Format: ${esc(s.format || '1-on-1')}</div>
              ${s.description ? `<p class="text-xs text-muted mt-1">${esc(s.description)}</p>` : ''}
            </div>
          `).join('') : '<div class="text-xs muted py-2">No teaching skills listed yet.</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>🌱 Skills I Want to Learn</h3>
          <button class="btn sm" onclick="HubActions.openAddSkillModal('learn')">+ Add Target</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(u.skillsWanted || []).length ? (u.skillsWanted || []).map(s => `
            <div style="padding: 10px 14px; background: var(--bg-surface-elevated); border-radius: var(--radius-sm); border: 1px solid var(--line);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <b>${esc(s.name)}</b>
                <span class="chip learn text-xs">${esc(s.level)}</span>
              </div>
              <div class="text-xs muted mt-1">${esc(s.category)}</div>
              ${s.description ? `<p class="text-xs text-muted mt-1">${esc(s.description)}</p>` : ''}
            </div>
          `).join('') : '<div class="text-xs muted py-2">No learning skills listed yet.</div>'}
        </div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-head">
        <h3>🕒 Availability &amp; Preferred Formats</h3>
      </div>
      <div class="row2">
        <div>
          <span class="text-xs font-bold uppercase muted">Active Availability:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            ${(u.availability || []).length ? (u.availability || []).map(a => `<span class="tag-pill text-xs">🕒 ${esc(a)}</span>`).join('') : '<span class="text-xs muted">Not specified</span>'}
          </div>
        </div>
        <div>
          <span class="text-xs font-bold uppercase muted">Preferred Methods:</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            ${(u.preferredMethods || []).length ? (u.preferredMethods || []).map(m => `<span class="tag-pill text-xs">💡 ${esc(m)}</span>`).join('') : '<span class="text-xs muted">Not specified</span>'}
          </div>
        </div>
      </div>
    </div>
  `;
};

// Register HubActions onto existing actions dispatcher
Object.assign(actions, HubActions);

// Real-time socket message dispatching into chat view
if (typeof io !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initHubSocket();
  });
}

// Automatically sync session with backend if user is already logged in
if (typeof me !== 'undefined' && me) {
  syncSessionWithBackend(me);
}
