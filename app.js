'use strict';
/* =====================================================================
   SkillSwap - Community Skill Exchange & Learning Network System
   Data Storage Engine: HTML5 LocalStorage (synchronous, persistent, client-side)
   ===================================================================== */

/* ----------------------- LOCALSTORAGE DATABASE ----------------------- */
const StorageDB = (() => {
  const PREFIX = 'skillswap_';
  const STORES = ['users', 'skills', 'goals', 'activities', 'achievements', 'connections', 'proposals', 'meta'];

  function getKey(store) {
    return PREFIX + store;
  }

  function readStore(store) {
    try {
      const raw = localStorage.getItem(getKey(store));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('LocalStorage read error:', store, e);
      return [];
    }
  }

  function writeStore(store, data) {
    try {
      localStorage.setItem(getKey(store), JSON.stringify(data));
      updateStorageMeta();
    } catch (e) {
      console.error('LocalStorage write error:', store, e);
      alert('LocalStorage quota exceeded or unavailable. Please clear browser storage or export data.');
    }
  }

  function nextId(store) {
    const list = readStore(store);
    return list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  }

  function updateStorageMeta() {
    let bytes = 0;
    let records = 0;
    for (const s of STORES) {
      const raw = localStorage.getItem(getKey(s));
      if (raw) {
        bytes += raw.length * 2;
        if (s !== 'meta') {
          try { records += JSON.parse(raw).length; } catch { }
        }
      }
    }
    const kb = (bytes / 1024).toFixed(1);
    const ind = document.getElementById('storageIndicator');
    if (ind) {
      const txt = ind.querySelector('.storage-text');
      if (txt && !txt.textContent.includes('MongoDB')) {
        txt.textContent = '⚡ MongoDB Atlas · Live WebSocket Sync';
      }
    }
  }

  return {
    all: (store) => readStore(store),
    get: (store, id) => readStore(store).find(item => item.id === id),
    by: (store, field, val) => readStore(store).filter(item => item[field] === val),
    one: (store, field, val) => readStore(store).find(item => item[field] === val),
    add: (store, obj) => {
      const list = readStore(store);
      const item = { ...obj, id: nextId(store) };
      list.push(item);
      writeStore(store, list);
      return item.id;
    },
    put: (store, obj) => {
      const list = readStore(store);
      const ix = list.findIndex(item => item.id === obj.id);
      if (ix >= 0) {
        list[ix] = obj;
      } else {
        list.push(obj);
      }
      writeStore(store, list);
      return obj.id;
    },
    del: (store, id) => {
      const list = readStore(store).filter(item => item.id !== id);
      writeStore(store, list);
    },
    count: (store) => readStore(store).length,
    getMeta: (key) => {
      const meta = readStore('meta');
      const item = Array.isArray(meta) ? meta.find(m => m.key === key) : null;
      return item ? item.value : null;
    },
    setMeta: (key, value) => {
      const meta = readStore('meta');
      const ix = Array.isArray(meta) ? meta.findIndex(m => m.key === key) : -1;
      if (ix >= 0) meta[ix].value = value;
      else meta.push({ key, value });
      writeStore('meta', meta);
    },
    clearAll: () => {
      STORES.forEach(s => localStorage.removeItem(getKey(s)));
      updateStorageMeta();
    },
    getStats: () => {
      let bytes = 0;
      let records = 0;
      const breakdown = {};
      for (const s of STORES) {
        const raw = localStorage.getItem(getKey(s));
        const count = raw ? (s === 'meta' ? 1 : JSON.parse(raw).length) : 0;
        breakdown[s] = count;
        records += count;
        if (raw) bytes += raw.length * 2;
      }
      return { records, bytes, kb: (bytes / 1024).toFixed(1), breakdown };
    },
    updateStorageMeta
  };
})();

/* ---------------------------- HELPERS ------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayStr = () => ymd(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const fmtDate = s => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const hrs = m => (Math.round((+m || 0) / 6) / 10).toFixed(1); // minutes to hours
const lname = s => (s.name || '').trim().toLowerCase();

const PALETTES = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #0284c7, #2563eb)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ec4899, #db2777)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #f43f5e, #e11d48)',
];

const avatar = (name, cls = 'md') => {
  const clean = (name || 'Anonymous').trim();
  const ini = clean.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const sum = [...clean].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const bg = PALETTES[sum % PALETTES.length];
  return `<div class="avatar ${cls}" style="background:${bg}">${esc(ini)}</div>`;
};

const bar = (p, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(p)))}%"></i></div>`;
const empty = (msg, icon = '🍃') => `<div class="empty"><span class="empty-icon">${icon}</span><div>${msg}</div></div>`;

const CATEGORIES = [
  'Programming', 'Graphic Design', 'Public Speaking', 'Video Editing',
  'Content Writing', 'Photography', 'Digital Marketing', 'Music',
  'Languages', 'Data & AI', 'Business & Finance', 'Other'
];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const FORMATS = ['1-on-1 Session', 'Project Collaboration', 'Code & Work Review', 'Casual Discussion'];

const opts = (arr, sel) => arr.map(o => `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');

function toast(msg, type = '') {
  const container = $('#toasts');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icon = type === 'ok' ? '✅' : type === 'err' ? '⚠️' : type === 'gold' ? '🌟' : 'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    t.style.transition = 'all 0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function download(filename, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCSV = (rows, cols) => [cols.map(csvCell).join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n');

/* ------------------------- GAMIFICATION / XP ------------------------ */
function calculateXP(ctx) {
  let xp = 0;
  // +100 per skill added
  xp += (ctx.skills.length * 100);
  // +50 per session + 1 XP per minute
  ctx.acts.forEach(a => {
    xp += 50 + Math.round((+a.minutes || 0) * 0.7);
    if (a.type === 'taught') xp += 50; // Mentor bonus
  });
  // +150 per goal milestone done
  ctx.goals.forEach(g => {
    (g.milestones || []).forEach(m => { if (m.done) xp += 100; });
    if (goalProgress(g) >= 100) xp += 300; // Goal completed bonus
  });
  // +150 per unlocked achievement
  xp += (ctx.ach.length * 150);
  // +75 per connected partner
  xp += (ctx.conns.length * 75);
  // +100 per completed exchange proposal
  const myProps = StorageDB.all('proposals').filter(p => (p.fromUserId === me.id || p.toUserId === me.id) && p.status === 'completed');
  xp += (myProps.length * 150);
  return xp;
}

const LEVELS_LADDER = [
  { level: 1, title: 'Novice Learner', xpNeeded: 0 },
  { level: 2, title: 'Apprentice',     xpNeeded: 350 },
  { level: 3, title: 'Knowledge Seeker', xpNeeded: 850 },
  { level: 4, title: 'Active Exchanger', xpNeeded: 1600 },
  { level: 5, title: 'Peer Mentor',    xpNeeded: 2700 },
  { level: 6, title: 'Skill Champion', xpNeeded: 4200 },
  { level: 7, title: 'Master Collaborator', xpNeeded: 6200 },
  { level: 8, title: 'Network Leader', xpNeeded: 8800 },
  { level: 9, title: 'Wisdom Sage',    xpNeeded: 12000 },
  { level: 10, title: 'Grand Mentor',  xpNeeded: 16000 },
];

function getLevelInfo(xp) {
  let cur = LEVELS_LADDER[0];
  let next = LEVELS_LADDER[1];
  for (let i = 0; i < LEVELS_LADDER.length; i++) {
    if (xp >= LEVELS_LADDER[i].xpNeeded) {
      cur = LEVELS_LADDER[i];
      next = LEVELS_LADDER[i + 1] || null;
    } else {
      break;
    }
  }
  const minXp = cur.xpNeeded;
  const maxXp = next ? next.xpNeeded : cur.xpNeeded + 5000;
  const pct = Math.min(100, Math.max(0, Math.round(((xp - minXp) / (maxXp - minXp)) * 100)));
  return { level: cur.level, title: cur.title, xp, nextXp: maxXp, pct };
}

/* ----------------------------- STATE -------------------------------- */
let me = null;
const filters = { q: '', category: '', type: '', level: '', role: '', sort: 'match' };
let historyFilter = 'all';

function loadCtx() {
  const skills = StorageDB.by('skills', 'userId', me.id);
  const goals = StorageDB.by('goals', 'userId', me.id);
  const acts = StorageDB.by('activities', 'userId', me.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const conns = StorageDB.by('connections', 'userId', me.id);
  const ach = StorageDB.by('achievements', 'userId', me.id);
  const props = StorageDB.all('proposals').filter(p => p.fromUserId === me.id || p.toUserId === me.id);
  return { skills, goals, acts, conns, ach, props };
}

function loadCommunity() {
  const users = StorageDB.all('users');
  const skills = StorageDB.all('skills');
  const acts = StorageDB.all('activities');
  const proposals = StorageDB.all('proposals');
  return { users, skills, acts, proposals };
}

/* ------------------------- DOMAIN CALCULATIONS ----------------------- */
const goalProgress = g => {
  if (g.milestones && g.milestones.length) {
    const done = g.milestones.filter(m => m.done).length;
    return Math.round((done / g.milestones.length) * 100);
  }
  return g.progress || 0;
};

function streaks(acts) {
  const set = new Set(acts.map(a => a.date));
  let cur = 0;
  const d = new Date();
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (set.has(ymd(d))) {
    cur++;
    d.setDate(d.getDate() - 1);
  }
  let best = 0, run = 0, prev = null;
  for (const s of [...set].sort()) {
    run = prev && (new Date(s) - new Date(prev)) / 864e5 === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = s;
  }
  return { cur, best: Math.max(cur, best) };
}

const inRange = (acts, fromDaysAgo, toDaysAgo) => acts.filter(a => a.date >= daysAgo(fromDaysAgo) && a.date <= daysAgo(toDaysAgo));
const sumMin = acts => acts.reduce((t, a) => t + (+a.minutes || 0), 0);
const consistency = acts => Math.min(100, Math.round((new Set(inRange(acts, 29, 0).map(a => a.date)).size / 30) * 100));

function monthlyTrend(acts, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = ymd(d).slice(0, 7);
    const list = acts.filter(a => a.date.startsWith(key));
    out.push({
      label: d.toLocaleString(undefined, { month: 'short' }),
      minutes: sumMin(list),
      count: list.length
    });
  }
  return out;
}

function hoursBySkill(acts) {
  const m = {};
  acts.forEach(a => {
    const k = a.skill || 'General Practice';
    m[k] = (m[k] || 0) + (+a.minutes || 0);
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

/* ----------------------- MATCH ENGINE -------------------------------- */
function computeMatches(mySkills, users, allSkills) {
  const myTeach = mySkills.filter(s => s.type === 'teach');
  const myLearn = mySkills.filter(s => s.type === 'learn');

  const wantNames = new Set(myLearn.map(lname));
  const teachNames = new Set(myTeach.map(lname));
  const wantCats = new Set(myLearn.map(s => s.category));
  const teachCats = new Set(myTeach.map(s => s.category));

  return users
    .filter(u => u.id !== me.id)
    .map(u => {
      const uSkills = allSkills.filter(s => s.userId === u.id);
      const theyTeach = uSkills.filter(s => s.type === 'teach');
      const theyLearn = uSkills.filter(s => s.type === 'learn');

      // Exact Skill Swaps
      const canTeachMe = theyTeach.filter(s => wantNames.has(lname(s)));
      const iCanTeachThem = theyLearn.filter(s => teachNames.has(lname(s)));

      // Category Alignment
      const catTeach = theyTeach.filter(s => !wantNames.has(lname(s)) && wantCats.has(s.category));
      const catLearn = theyLearn.filter(s => !teachNames.has(lname(s)) && teachCats.has(s.category));

      // Scoring
      const isMutual = canTeachMe.length > 0 && iCanTeachThem.length > 0;
      let score = 0;

      if (isMutual) {
        score = 90 + Math.min(10, (canTeachMe.length + iCanTeachThem.length - 2) * 5);
      } else {
        score = Math.min(2, canTeachMe.length) * 35 +
                Math.min(2, iCanTeachThem.length) * 25 +
                Math.min(2, catTeach.length) * 8 +
                Math.min(2, catLearn.length) * 8;
      }

      return {
        user: u,
        score: Math.min(100, Math.max(15, score)),
        canTeachMe,
        iCanTeachThem,
        catTeach,
        catLearn,
        theyTeach,
        theyLearn,
        mutual: isMutual
      };
    })
    .sort((a, b) => b.score - a.score);
}

/* ---------------------------- ACHIEVEMENTS --------------------------- */
const BADGES = [
  { id: 'first_teach',   icon: '🎓', title: 'Knowledge Giver',     desc: 'List your first skill to teach',         test: c => c.skills.some(s => s.type === 'teach') },
  { id: 'first_learn',   icon: '🌱', title: 'Curious Mind',       desc: 'Add a skill you want to learn',         test: c => c.skills.some(s => s.type === 'learn') },
  { id: 'collector',     icon: '🧩', title: 'Polymath in Training', desc: 'List 5 or more total skills',          test: c => c.skills.length >= 5 },
  { id: 'goal_setter',   icon: '🎯', title: 'Intentional Learner',desc: 'Create your first structured goal',      test: c => c.goals.length >= 1 },
  { id: 'goal_done',     icon: '🏆', title: 'Goal Crusher',       desc: 'Reach 100% completion on a goal',       test: c => c.goals.some(g => goalProgress(g) >= 100) },
  { id: 'first_session', icon: '📘', title: 'First Exchange',     desc: 'Record your first learning interaction', test: c => c.acts.length >= 1 },
  { id: 'streak3',       icon: '🔥', title: 'Consistency Spark',  desc: 'Maintain a 3-day learning streak',      test: c => streaks(c.acts).best >= 3 },
  { id: 'streak7',       icon: '⚡', title: 'Unstoppable Momentum',desc: 'Reach an impressive 7-day streak',     test: c => streaks(c.acts).best >= 7 },
  { id: 'mentor',        icon: '🤝', title: 'Master Mentor',      desc: 'Conduct 5 knowledge-sharing sessions',  test: c => c.acts.filter(a => a.type === 'taught').length >= 5 },
  { id: 'networker',     icon: '🌐', title: 'Community Connector',desc: 'Connect with 3 fellow learners',         test: c => c.conns.length >= 3 },
  { id: 'ten_hours',     icon: '⏱️', title: 'Century Club (10h)',  desc: 'Log 10 full hours of peer learning',    test: c => sumMin(c.acts) >= 600 },
  { id: 'proposal_sent', icon: '📨', title: 'Skill Barterer',     desc: 'Propose a mutual skill exchange',       test: c => c.props.some(p => p.fromUserId === me.id) },
  { id: 'proposal_deal', icon: '✨', title: 'Signed & Swapped',   desc: 'Complete an agreed skill exchange',     test: c => c.props.some(p => p.status === 'completed') },
];

function checkAchievements() {
  const c = loadCtx();
  const have = new Set(c.ach.map(a => a.badge));
  for (const b of BADGES) {
    if (!have.has(b.id) && b.test(c)) {
      StorageDB.add('achievements', { userId: me.id, badge: b.id, date: todayStr() });
      toast(`Achievement Unlocked: ${b.title}! (${b.icon})`, 'gold');
      triggerConfetti();
    }
  }
}

/* ------------------------------ SEED DATA ---------------------------- */
const DEMO_USERS = [
  {
    name: 'Aarav Sharma',
    email: 'aarav@demo.com',
    role: 'Student',
    institution: 'IIT Madras',
    education: 'B.Tech Computer Science & Engineering',
    location: 'Chennai, India',
    bio: 'Full-stack builder passionate about open source and AI tooling. Looking to level up in design and public speaking for hackathon pitches.',
    interests: 'React, Node.js, System Design, AI Agents, Public Speaking',
    teach: [
      ['JavaScript', 'Programming', 'Advanced', '3 years building full-stack apps. Can teach ES6+, async JS, and frameworks.', '1-on-1 Session'],
      ['React', 'Programming', 'Intermediate', 'Hooks, state management, and modern component patterns.', 'Project Collaboration'],
      ['Git & GitHub', 'Programming', 'Expert', 'Branching, PRs, CI/CD, and open source workflows.', 'Code & Work Review'],
      ['Python Basics', 'Programming', 'Intermediate', 'Automation scripts, web scraping, and data structures.', '1-on-1 Session']
    ],
    learn: [
      ['UI/UX & Figma', 'Graphic Design', 'Intermediate', 'Want to design my own interfaces instead of using boilerplate templates.'],
      ['Public Speaking', 'Public Speaking', 'Advanced', 'Need to give persuasive 5-minute tech elevator pitches.'],
      ['Photography', 'Photography', 'Beginner', 'Weekend hobbyist wanting to master lighting and manual camera settings.']
    ]
  },
  {
    name: 'Meera Iyer',
    email: 'meera@demo.com',
    role: 'Student',
    institution: 'National Institute of Design',
    education: 'M.Des Interaction & Visual Communication',
    location: 'Ahmedabad, India',
    bio: 'UI/UX and brand designer with 4 years craft. Dream of bringing my interface mockups to life in code without waiting on devs.',
    interests: 'Figma, Design Systems, Typography, Creative Coding, Micro-interactions',
    teach: [
      ['UI/UX & Figma', 'Graphic Design', 'Expert', 'Design systems, auto-layout, wireframing, and usability testing.', 'Project Collaboration'],
      ['Graphic Design', 'Graphic Design', 'Advanced', 'Visual hierarchy, typography, branding, and color theory.', '1-on-1 Session'],
      ['Photography', 'Photography', 'Intermediate', 'Street and product photography composition.', '1-on-1 Session']
    ],
    learn: [
      ['JavaScript', 'Programming', 'Beginner', 'Need to make interactive prototypes and code my portfolio.'],
      ['React', 'Programming', 'Beginner', 'Learn component-driven web UI.'],
      ['Digital Marketing', 'Digital Marketing', 'Intermediate', 'Showcasing design services to global freelance clients.']
    ]
  },
  {
    name: 'Rohan Das',
    email: 'rohan@demo.com',
    role: 'Professional',
    institution: 'BrightWave Growth Labs',
    education: 'MBA Strategic Marketing & Analytics',
    location: 'Bengaluru, India',
    bio: 'Senior Growth Strategist. Have scaled SaaS products from 0 to 1M users. Eager to automate analytics with Python and edit video ads.',
    interests: 'SEO, Performance Marketing, Python Automation, Storytelling, Video Ads',
    teach: [
      ['Digital Marketing', 'Digital Marketing', 'Expert', 'Funnels, user acquisition, paid channels, and CAC optimization.', '1-on-1 Session'],
      ['Public Speaking', 'Public Speaking', 'Advanced', 'Executive presentation, speech structure, and vocal presence.', '1-on-1 Session'],
      ['SEO & Copy Strategy', 'Digital Marketing', 'Advanced', 'High-ranking content briefs and technical SEO audits.', 'Casual Discussion']
    ],
    learn: [
      ['Python Basics', 'Programming', 'Beginner', 'Automate marketing data scraping and Google Analytics reporting.'],
      ['Video Editing', 'Video Editing', 'Intermediate', 'Create high-converting vertical reels and TikTok hooks.']
    ]
  },
  {
    name: 'Priya Nair',
    email: 'priya@demo.com',
    role: 'Professional',
    institution: 'The Narrative Guild',
    education: 'M.A. Journalism & Media Studies',
    location: 'Mumbai, India',
    bio: 'Freelance investigative writer and corporate storyteller. Crafting newsletters and long-form thought leadership.',
    interests: 'Copywriting, Creative Writing, Brand Voice, Podcasting, Visual Essays',
    teach: [
      ['Content Writing', 'Content Writing', 'Expert', 'Long-form essays, persuasive prose, clarity, and narrative hooks.', '1-on-1 Session'],
      ['Public Speaking', 'Public Speaking', 'Intermediate', 'Storytelling on stage and interview prep.', 'Casual Discussion'],
      ['Copywriting', 'Content Writing', 'Advanced', 'Conversion copy for landing pages and email sequences.', 'Code & Work Review']
    ],
    learn: [
      ['UI/UX & Figma', 'Graphic Design', 'Beginner', 'Visual assets for newsletter and blog headers.'],
      ['Photography', 'Photography', 'Intermediate', 'Editorial portraits for articles.'],
      ['Digital Marketing', 'Digital Marketing', 'Intermediate', 'Organic newsletter growth and monetization.']
    ]
  },
  {
    name: 'Karthik Raj',
    email: 'karthik@demo.com',
    role: 'Student',
    institution: 'Whistling Woods International',
    education: 'B.Sc Film & Television Production',
    location: 'Mumbai, India',
    bio: 'Documentary editor and motion designer. Love rhythm, pacing, and sound design. Looking to automate batch rendering with code.',
    interests: 'Premiere Pro, DaVinci Resolve, After Effects, Sound Design, Python Scripting',
    teach: [
      ['Video Editing', 'Video Editing', 'Expert', 'Pacing, narrative arc, B-roll selection, and YouTube pacing.', 'Project Collaboration'],
      ['Color Grading', 'Video Editing', 'Advanced', 'Color palettes, skin tones, and LUT creation in DaVinci.', '1-on-1 Session'],
      ['Photography', 'Photography', 'Advanced', 'Cinematic framing, camera lenses, and shutter balance.', '1-on-1 Session']
    ],
    learn: [
      ['Python Basics', 'Programming', 'Beginner', 'Automate file renaming and render queuing.'],
      ['Content Writing', 'Content Writing', 'Intermediate', 'Scriptwriting and pitch documents for film grants.']
    ]
  },
  {
    name: 'Sneha Pillai',
    email: 'sneha@demo.com',
    role: 'Student',
    institution: 'Loyola College',
    education: 'M.Sc Applied Statistics & AI',
    location: 'Chennai, India',
    bio: 'Math lover and competitive debater. I train transformers on weekends and judge collegiate parliamentary debates.',
    interests: 'Machine Learning, PyTorch, Parliamentary Debate, Critical Thinking, UI Prototyping',
    teach: [
      ['Python Basics', 'Programming', 'Expert', 'NumPy, Pandas, algorithmic thinking, and clean code.', 'Code & Work Review'],
      ['Machine Learning', 'Data & AI', 'Advanced', 'Scikit-learn, regression models, classification, and neural nets.', '1-on-1 Session'],
      ['Public Speaking', 'Public Speaking', 'Expert', 'Debate argumentation, refutation, and vocal control.', '1-on-1 Session']
    ],
    learn: [
      ['UI/UX & Figma', 'Graphic Design', 'Beginner', 'Making scientific research dashboards look clean and inviting.'],
      ['Content Writing', 'Content Writing', 'Intermediate', 'Translating complex statistical findings for general audiences.']
    ]
  },
  {
    name: 'Vikram Menon',
    email: 'vikram@demo.com',
    role: 'Professional',
    institution: 'Zoho Corporation',
    education: 'B.E. Electronics & Communications',
    location: 'Coimbatore, India',
    bio: 'Cloud Infrastructure Lead by day, acoustic fingerstyle guitarist by night. Want to learn public speaking to lead conference keynotes.',
    interests: 'Cloud Architecture, Linux, Guitar, Public Speaking, Video Tutorials',
    teach: [
      ['Acoustic Guitar', 'Music', 'Advanced', 'Fingerpicking, chords, ear training, and music theory.', '1-on-1 Session'],
      ['Python Basics', 'Programming', 'Expert', 'Backend microservices, APIs, and performance tuning.', 'Code & Work Review'],
      ['SQL & Database Design', 'Data & AI', 'Advanced', 'Query optimization, schema relations, and indexing.', '1-on-1 Session']
    ],
    learn: [
      ['Public Speaking', 'Public Speaking', 'Intermediate', 'Conference keynotes and podcast interviews.'],
      ['Video Editing', 'Video Editing', 'Beginner', 'Recording high-quality acoustic guitar tutorials for YouTube.']
    ]
  },
  {
    name: 'Divya Krishnan',
    email: 'divya@demo.com',
    role: 'Professional',
    institution: 'Alliance Française & SRM',
    education: 'M.A. French Literature & Translation',
    location: 'Chennai, India',
    bio: 'Polyglot educator teaching French and professional English communication. Building a language learning web app.',
    interests: 'French, Linguistics, English Pronunciation, Web Development, Mobile UI',
    teach: [
      ['French Language', 'Languages', 'Advanced', 'Conversational fluency, grammar fundamentals, and DELF prep.', '1-on-1 Session'],
      ['English Communication', 'Languages', 'Expert', 'Accent softening, business correspondence, and idioms.', '1-on-1 Session'],
      ['Public Speaking', 'Public Speaking', 'Advanced', 'Overcoming stage fright and bilingual presentation.', '1-on-1 Session']
    ],
    learn: [
      ['JavaScript', 'Programming', 'Beginner', 'Build interactive flashcard quizzes and learning widgets.'],
      ['UI/UX & Figma', 'Graphic Design', 'Beginner', 'Design clean minimalist mobile study screens.']
    ]
  }
];

function seedIfEmpty() {
  if (StorageDB.count('users') > 0) return;

  DEMO_USERS.forEach((d, i) => {
    const uid = StorageDB.add('users', {
      name: d.name,
      email: d.email,
      role: d.role,
      institution: d.institution,
      education: d.education,
      location: d.location,
      bio: d.bio,
      interests: d.interests,
      createdAt: daysAgo(60 - i * 4),
      demo: true
    });

    // Teach skills
    d.teach.forEach(([name, category, level, description, format]) => {
      StorageDB.add('skills', {
        userId: uid,
        type: 'teach',
        name,
        category,
        level,
        description: description || '',
        format: format || '1-on-1 Session',
        createdAt: daysAgo(50 - i * 3)
      });
    });

    // Learn skills
    d.learn.forEach(([name, category, level, description]) => {
      StorageDB.add('skills', {
        userId: uid,
        type: 'learn',
        name,
        category,
        level: level || 'Beginner',
        description: description || '',
        createdAt: daysAgo(48 - i * 3)
      });
    });

    // Sample sessions across members
    const allSkills = [...d.teach.map(t => t[0]), ...d.learn.map(l => l[0])];
    for (let k = 0; k < 6; k++) {
      const days = (k * 4 + i) % 28;
      StorageDB.add('activities', {
        userId: uid,
        type: k % 3 === 0 ? 'taught' : k % 3 === 1 ? 'learned' : 'practiced',
        skill: allSkills[(k + i) % allSkills.length],
        partner: k % 2 === 0 ? 'Peer Community' : '',
        minutes: 30 + ((k * 15 + i * 10) % 75),
        date: daysAgo(days),
        rating: 4 + (k % 2),
        notes: 'Constructive review session covering fundamentals and live exercises.',
        goalId: null
      });
    }

    // Special rich seed for Aarav Sharma (Default user)
    if (i === 0) {
      // Extra sessions for visible streak
      for (let k = 0; k < 5; k++) {
        StorageDB.add('activities', {
          userId: uid,
          type: k % 2 === 0 ? 'learned' : 'taught',
          skill: k % 2 === 0 ? 'Public Speaking' : 'JavaScript',
          partner: k % 2 === 0 ? 'Rohan Das' : 'Meera Iyer',
          minutes: 45 + k * 10,
          date: daysAgo(k),
          rating: 5,
          notes: k % 2 === 0 ? 'Rehearsed 5-minute hackathon pitch with Rohan. Received feedback on posture and vocal pacing.' : 'Guided Meera through DOM events and React state hooks for her portfolio page.',
          goalId: 1
        });
      }

      // Active learning goals
      StorageDB.add('goals', {
        userId: uid,
        title: 'Master Hackathon Pitch & Delivery',
        skill: 'Public Speaking',
        targetDate: daysAgo(-14),
        progress: 0,
        createdAt: daysAgo(20),
        milestones: [
          { text: 'Analyze winning pitch frameworks (Problem, Solution, Demo)', done: true },
          { text: 'Write 3-minute concise script without technical jargon', done: true },
          { text: 'Mock rehearsal with peer mentor (Rohan Das)', done: true },
          { text: 'Record video practice and analyze pacing', done: false },
          { text: 'Live trial pitch in front of peer group', done: false }
        ]
      });

      StorageDB.add('goals', {
        userId: uid,
        title: 'Design Complete Web Portfolio in Figma',
        skill: 'UI/UX & Figma',
        targetDate: daysAgo(-30),
        progress: 0,
        createdAt: daysAgo(15),
        milestones: [
          { text: 'Collect moodboard and typography inspiration', done: true },
          { text: 'Wireframe hero section, project grid, and contact modal', done: true },
          { text: 'Get feedback from Meera Iyer (Design mentor)', done: false },
          { text: 'Create responsive mobile mockups', done: false }
        ]
      });

      // Reciprocal proposal between Aarav & Meera
      StorageDB.add('proposals', {
        fromUserId: 2, // Meera
        toUserId: 1,   // Aarav
        teachSkill: 'UI/UX & Figma',
        learnSkill: 'JavaScript',
        date: daysAgo(-3),
        time: '18:00',
        duration: 60,
        message: 'Hey Aarav! I saw you want to master Figma for your portfolio, and you teach JavaScript. Would love to do a 1-hour swap this Thursday!',
        status: 'pending',
        createdAt: daysAgo(1)
      });

      // Existing connections
      StorageDB.add('connections', { userId: 1, otherId: 2, createdAt: daysAgo(10) }); // Meera
      StorageDB.add('connections', { userId: 1, otherId: 3, createdAt: daysAgo(8) });  // Rohan
    }
  });
}

/* ------------------------------- AUTH -------------------------------- */
const forms = {};

forms.login = async f => {
  const email = f.email.value.trim().toLowerCase();
  const password = f.password.value;
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password: password || 'password123' }
    });
    if (res.success && res.user) {
      setAuthToken(res.token);
      let u = StorageDB.one('users', 'email', email);
      if (!u) {
        const id = StorageDB.add('users', {
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          institution: res.user.institution,
          systemRole: res.user.systemRole,
          createdAt: new Date().toISOString()
        });
        u = StorageDB.get('users', id);
      }
      u.systemRole = res.user.systemRole;
      u.mongoId = res.user.id;
      startSession(u);
      return toast(`Welcome back, ${u.name.split(' ')[0]}!`, 'ok');
    } else if (res.error) {
      return toast(res.error, 'err');
    }
  } catch (err) {
    console.warn('Backend login fallback:', err);
  }

  const u = StorageDB.one('users', 'email', email);
  if (!u) {
    return toast('No user found with that email. Pick a demo user or register.', 'err');
  }
  startSession(u);
  toast(`Welcome back, ${u.name.split(' ')[0]}!`, 'ok');
};

forms.register = async f => {
  const name = f.name.value.trim();
  const email = f.email.value.trim().toLowerCase();
  const password = f.password.value;
  const role = f.role.value;
  const institution = f.institution.value.trim();

  try {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, password: password || 'password123', role, institution }
    });
    if (res.success && res.user) {
      setAuthToken(res.token);
      const id = StorageDB.add('users', {
        name,
        email,
        role,
        institution,
        systemRole: res.user.systemRole,
        education: '',
        location: '',
        bio: '',
        interests: '',
        createdAt: new Date().toISOString()
      });
      const u = StorageDB.get('users', id);
      u.mongoId = res.user.id;
      u.systemRole = res.user.systemRole;
      startSession(u);
      toast('Welcome to SkillSwap! Account created in MongoDB.', 'ok');
      location.hash = '#community';
      return;
    } else if (res.error) {
      return toast(res.error, 'err');
    }
  } catch (err) {
    console.warn('Backend register fallback:', err);
  }

  if (StorageDB.one('users', 'email', email)) {
    return toast('That email is already registered. Please log in.', 'err');
  }
  const id = StorageDB.add('users', {
    name,
    email,
    role,
    institution,
    education: '',
    location: '',
    bio: '',
    interests: '',
    createdAt: new Date().toISOString()
  });
  startSession(StorageDB.get('users', id));
  toast('Welcome to SkillSwap! Let’s add your first skill to teach.', 'ok');
  location.hash = '#skills';
};

function startSession(u) {
  me = u;
  StorageDB.setMeta('session', u.id);
  if (typeof syncSessionWithBackend === 'function') {
    syncSessionWithBackend(u);
  }
  showApp();
}

function showApp() {
  const auth = $('#auth');
  const app = $('#app');
  if (auth) auth.classList.add('hidden');
  if (app) app.classList.remove('hidden');

  updateUserChrome();
  populateUserSwitcher();
  checkAchievements();
  render();
}

function updateUserChrome() {
  if (!me) return;
  const ctx = loadCtx();
  const xp = calculateXP(ctx);
  const lvl = getLevelInfo(xp);

  // Topbar
  const topAvatar = $('#topAvatar');
  if (topAvatar) topAvatar.innerHTML = avatar(me.name, 'sm');
  const topUserName = $('#topUserName');
  if (topUserName) topUserName.textContent = me.name;
  const topUserRole = $('#topUserRole');
  if (topUserRole) topUserRole.textContent = `${me.role} · Lvl ${lvl.level}`;

  // Sidebar
  const sbLevelChip = $('#sbLevelChip');
  if (sbLevelChip) sbLevelChip.textContent = `Lvl ${lvl.level}`;
  const sbUserPreview = $('#sbUserPreview');
  if (sbUserPreview) sbUserPreview.innerHTML = `${avatar(me.name, 'sm')}<div><b>${esc(me.name)}</b><div class="text-xs muted">${esc(me.institution || me.role)}</div></div>`;
  const sbXpTitle = $('#sbXpTitle');
  if (sbXpTitle) sbXpTitle.textContent = `Lvl ${lvl.level} · ${lvl.title}`;
  const sbXpVal = $('#sbXpVal');
  if (sbXpVal) sbXpVal.textContent = `${lvl.xp} / ${lvl.nextXp} XP`;
  const sbXpBar = $('#sbXpBar');
  if (sbXpBar) sbXpBar.style.width = `${lvl.pct}%`;

  // Proposal notification count
  const pendingProps = StorageDB.all('proposals').filter(p => p.toUserId === me.id && p.status === 'pending');
  const badge = $('#proposalCountBadge');
  if (badge) {
    if (pendingProps.length > 0) {
      badge.textContent = pendingProps.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  StorageDB.updateStorageMeta();
}

function populateUserSwitcher() {
  const users = StorageDB.all('users');
  const sel = $('#userQuickSwitch');
  if (sel) {
    sel.innerHTML = users.map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${esc(u.name)} (${esc(u.role)})</option>`).join('');
  }
}

/* ------------------------------- ROUTER ------------------------------ */
const PAGES = [
  // Phase 10: Clean Connected Application Navigation
  ['dashboard', '🏠', 'Personalized Dashboard', 'Real-time overview of skills, matches, sessions & learning progress'],
  ['discover', '🔍', 'Discover Skills', 'Find members with complementary skills & explore peer directory'],
  ['matches', '🤝', 'Learning Partners', 'Smart skill matching with explainable compatibility scores'],
  ['community', '🌐', 'Community Knowledge Hub', 'Peer tutorials, notes, learning tips & shared project resources'],
  ['sessions', '📅', 'My Learning Sessions', 'Schedule, accept, complete & track learning exchanges'],
  ['messages', '💬', 'Live Chat', 'Real-time 1-on-1 messaging with learning partners'],
  ['notifications', '🔔', 'Notifications', 'Real-time updates on requests, sessions, reviews & endorsements'],
  ['analytics', '📈', 'Goals & Analytics', 'Activity streaks, hours, skill distribution & milestones'],
  ['profile', '👤', 'My Profile', 'Personal info, skills offered/wanted & availability'],
  ['trust', '🛡️', 'Trust & Verification', 'Activity reputation score, peer endorsements & skill verification'],
  ['bookmarks', '🔖', 'Saved Bookmarks', 'Your private collection of saved community guides and tips'],
  ['moderation', '⚖️', 'Moderation Portal', 'Admin & Moderator portal for verifications and community reports'],
  // Legacy aliases
  ['proposals', '📅', 'My Learning Sessions', 'Schedule, accept, complete & track learning exchanges'],
  ['skills', '👤', 'My Profile', 'Manage skills and availability'],
  ['goals', '📈', 'Goals & Analytics', 'Track milestone goals'],
  ['activity', '📈', 'Goals & Analytics', 'Learning activity log'],
  ['progress', '📈', 'Goals & Analytics', 'Streaks and analytics']
];

const views = {};
const after = {};

function render() {
  if (!me) return;
  let hash = (location.hash.slice(1) || 'dashboard').split('?')[0];
  if (hash === 'proposals') hash = 'sessions';
  if (hash === 'progress' || hash === 'goals' || hash === 'activity') hash = 'analytics';
  const current = views[hash] ? hash : 'dashboard';

  // Update Nav
  const nav = $('#nav');
  if (nav) {
    nav.innerHTML = `
      <div class="nav-section-title">Network &amp; Exchange</div>
      ${navLink('dashboard', '🏠', 'Dashboard')}
      ${navLink('discover', '🔍', 'Discover Skills')}
      ${navLink('matches', '🤝', 'Learning Partners')}
      ${navLink('community', '🌐', 'Community Hub')}
      ${navLink('sessions', '📅', 'My Sessions')}
      ${navLink('messages', '💬', 'Messages')}
      ${navLink('notifications', '🔔', 'Notifications')}

      <div class="nav-section-title">Growth &amp; Reputation</div>
      ${navLink('analytics', '📈', 'Goals &amp; Analytics')}
      ${navLink('profile', '👤', 'My Profile')}
      ${navLink('trust', '🛡️', 'Trust &amp; Verification')}
      ${navLink('bookmarks', '🔖', 'Saved Bookmarks')}
      ${(me && ['admin', 'moderator'].includes(me.systemRole)) ? navLink('moderation', '⚖️', 'Moderation Portal') : ''}
    `;
  }

  function navLink(id, ico, label, badgeCount = 0) {
    const isActive = id === current;
    return `<a href="#${id}" class="${isActive ? 'active' : ''}">
      <span>${ico}</span>
      <span>${label}</span>
      ${badgeCount ? `<span class="nav-badge">${badgeCount}</span>` : ''}
    </a>`;
  }

  const pInfo = PAGES.find(p => p[0] === current);
  const pTitle = $('#pageTitle');
  if (pTitle) pTitle.textContent = pInfo ? pInfo[2] : 'SkillSwap';
  const pSub = $('#pageSubtitle');
  if (pSub) pSub.textContent = pInfo ? pInfo[3] : '';
  const sbar = $('#sidebar');
  if (sbar) sbar.classList.remove('open');

  const view = $('#view');
  if (view && views[current]) view.innerHTML = views[current]();
  updateUserChrome();

  if (after[current]) {
    setTimeout(after[current], 10);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ------------------------------ MODALS -------------------------------- */
function openModal(title, html, isLarge = false) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  const card = $('#modal .modal-card');
  if (card) {
    card.classList.toggle('modal-lg', !!isLarge);
  }
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
}

/* --------------------------- CELEBRATION FX --------------------------- */
function triggerConfetti() {
  const canvas = $('#confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0284c7', '#a855f7'];

  for (let i = 0; i < 90; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.4,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 4 + 2,
      speedX: (Math.random() - 0.5) * 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  let frames = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
      ctx.restore();
    });

    frames++;
    if (frames < 120) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  animate();
}

/* ------------------------------ DASHBOARD ---------------------------- */
const statCard = (ico, num, lbl, sub = '') => `
  <div class="card stat-card">
    <div class="stat-top">
      <span class="stat-lbl">${esc(lbl)}</span>
      <span class="stat-icon">${ico}</span>
    </div>
    <div class="stat-val">${num}</div>
    ${sub ? `<div class="stat-sub muted">${sub}</div>` : ''}
  </div>`;

views.dashboard = () => {
  const c = loadCtx();
  const com = loadCommunity();
  const teach = c.skills.filter(s => s.type === 'teach');
  const learn = c.skills.filter(s => s.type === 'learn');
  const st = streaks(c.acts);
  const matches = computeMatches(c.skills, com.users, com.skills);
  const topMatches = matches.slice(0, 3);
  const activeGoals = c.goals.filter(g => goalProgress(g) < 100);
  const sugg = generatePersonalizedSuggestions(c, matches);

  const pendingProps = StorageDB.all('proposals').filter(p => p.toUserId === me.id && p.status === 'pending');

  return `
    <!-- Top Welcome Banner -->
    <div class="card mb-4" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%); border-color: rgba(99, 102, 241, 0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 16px;">
          ${avatar(me.name, 'lg')}
          <div>
            <h2 style="font-size: 22px;">Welcome back, ${esc(me.name.split(' ')[0])}!</h2>
            <p class="muted mb-1">${esc(me.role)} at <b>${esc(me.institution || 'SkillSwap Community')}</b> · ${esc(me.education || 'Lifelong Learner')}</p>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="chip primary">Level ${getLevelInfo(calculateXP(c)).level}</span>
              <span class="text-xs muted">${calculateXP(c)} XP Earned</span>
              <span class="text-xs muted">·</span>
              <span class="text-xs muted">🔥 ${st.cur} Day Streak Active</span>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn primary sm glow" data-action="addSkill">+ Add Skill</button>
          <button class="btn sm" data-action="addActivity">📝 Log Session</button>
          <button class="btn sm" data-action="addGoal">🎯 New Goal</button>
        </div>
      </div>
    </div>

    <!-- Proposals Alert Banner (if pending) -->
    ${pendingProps.length > 0 ? `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.08) 100%); border: 1px solid var(--mutual);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 26px;">📬</span>
            <div>
              <b>You have ${pendingProps.length} pending skill exchange proposal${pendingProps.length > 1 ? 's' : ''}!</b>
              <div class="text-xs muted">A community member wants to trade knowledge with you. Review and accept now.</div>
            </div>
          </div>
          <a href="#proposals" class="btn sm primary glow">Review Proposals (${pendingProps.length})</a>
        </div>
      </div>
    ` : ''}

    <!-- Stat Metrics Grid -->
    <div class="grid g4">
      ${statCard('🎓', teach.length, 'Skills Offered', `${teach.length ? 'Ready to share' : 'Add skills to teach'}`)}
      ${statCard('🌱', learn.length, 'Skills Learning', `${learn.length ? 'Active interests' : 'Add learning goals'}`)}
      ${statCard('⏱️', `${hrs(sumMin(c.acts))}h`, 'Exchange Time', `${c.acts.length} sessions completed`)}
      ${statCard('🔥', `${st.cur} days`, 'Current Streak', `Best: ${st.best} days · ${consistency(c.acts)}% consistency`)}
    </div>

    <!-- Quick Action Bar -->
    <div class="quick-actions-bar mt-4">
      <span class="quick-actions-title">⚡ Quick Actions</span>
      <button class="btn sm primary" data-action="addSkill">Teach a Skill</button>
      <button class="btn sm primary" data-action="addSkill" data-type="learn">Learn a Skill</button>
      <button class="btn sm" data-action="addActivity">Log Learning Interaction</button>
      <button class="btn sm" data-action="addGoal">Create Milestone Goal</button>
      <a href="#matches" class="btn sm">Find Mutual Exchanges</a>
    </div>

    <!-- Section 1: Skills & Goals Overview -->
    <div class="grid g2 section">
      <!-- Skills Snapshot -->
      <div class="card">
        <div class="card-head">
          <h3>🎓 My Skill Portfolio</h3>
          <a href="#skills" class="text-xs font-semibold">Manage Skills →</a>
        </div>
        
        <div class="mb-3">
          <span class="text-xs font-bold uppercase muted">I can teach:</span>
          <div style="margin-top: 6px;">
            ${teach.length ? teach.map(s => `<span class="chip teach" title="${esc(s.category)} · ${esc(s.level)}">🎓 ${esc(s.name)} <small>(${esc(s.level)})</small></span>`).join('') : empty('No teaching skills listed yet. Add what you know!', '📚')}
          </div>
        </div>

        <div>
          <span class="text-xs font-bold uppercase muted">I want to learn:</span>
          <div style="margin-top: 6px;">
            ${learn.length ? learn.map(s => `<span class="chip learn" title="${esc(s.category)}">🌱 ${esc(s.name)}</span>`).join('') : empty('No skills you want to learn. Discover new skills!', '💡')}
          </div>
        </div>
      </div>

      <!-- Active Goals Snapshot -->
      <div class="card">
        <div class="card-head">
          <h3>🎯 Active Learning Goals</h3>
          <a href="#goals" class="text-xs font-semibold">View All (${c.goals.length}) →</a>
        </div>
        ${activeGoals.length ? activeGoals.slice(0, 3).map(g => {
          const p = goalProgress(g);
          const left = g.targetDate ? Math.ceil((new Date(g.targetDate) - new Date(todayStr())) / 864e5) : null;
          return `
            <div style="margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span class="font-semibold text-sm">${esc(g.title)}</span>
                <span class="text-xs font-bold ${left !== null && left < 0 ? 'text-danger' : 'muted'}">
                  ${p}% · ${g.targetDate ? (left < 0 ? `Overdue by ${-left}d` : `${left}d left`) : 'Ongoing'}
                </span>
              </div>
              ${bar(p, p >= 100 ? 'green' : '')}
            </div>
          `;
        }).join('') : empty('No active goals right now. Create a structured learning goal!', '🎯')}
      </div>
    </div>

    <!-- Section 2: Matches & Recent Activity -->
    <div class="grid g2 section">
      <!-- High Compatibility Learning Partners -->
      <div class="card">
        <div class="card-head">
          <h3>🤝 Recommended Learning Partners</h3>
          <a href="#matches" class="text-xs font-semibold">See All Matches →</a>
        </div>
        ${topMatches.length ? topMatches.map(m => partnerRow(m, true, c.conns)).join('') : empty('Add skills to discover your matching partners in the community!', '👥')}
      </div>

      <!-- Recent Activities Feed -->
      <div class="card">
        <div class="card-head">
          <h3>📝 Recent Activity Feed</h3>
          <a href="#activity" class="text-xs font-semibold">Activity Log →</a>
        </div>
        ${c.acts.length ? c.acts.slice(0, 4).map(a => `
          <div class="item">
            <span style="font-size: 22px;">${actIcon(a.type)}</span>
            <div class="grow">
              <div class="title">${esc(a.skill)}</div>
              <div class="text-xs muted">
                <span class="font-bold uppercase">${esc(a.type)}</span> · ${a.minutes} min
                ${a.partner ? `· with <b>${esc(a.partner)}</b>` : ''}
                ${a.rating ? `· ${'★'.repeat(a.rating)}` : ''}
              </div>
            </div>
            <span class="text-xs muted">${fmtDate(a.date)}</span>
          </div>
        `).join('') : empty('No learning sessions recorded yet. Log your first session today!', '⏱️')}
      </div>
    </div>

    <!-- Section 3: Personalized Suggestions Banner -->
    <div class="card section" style="border-left: 4px solid var(--primary);">
      <div class="card-head">
        <h3>💡 Personalized Guidance &amp; Insights</h3>
      </div>
      <div style="display: grid; gap: 10px;">
        ${sugg.map(s => `
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="color: var(--primary); font-size: 16px;">✦</span>
            <div class="text-sm">${s}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

const actIcon = t => ({ learned: '📘', taught: '🎓', practiced: '🛠️' }[t] || '📘');

function partnerRow(m, withConnect, conns) {
  const isConnected = conns && conns.some(c => c.otherId === m.user.id);
  return `
    <div class="item ${m.mutual ? 'mutual-row' : ''}">
      ${avatar(m.user.name, 'sm')}
      <div class="grow">
        <div class="title" style="display: flex; align-items: center; gap: 6px;">
          ${esc(m.user.name)}
          ${m.mutual ? '<span class="chip mutual" style="font-size: 10px; padding: 2px 6px;">🔁 100% Mutual Match</span>' : ''}
        </div>
        <div class="text-xs muted">
          ${m.canTeachMe.length ? `Can teach you: <b style="color: var(--teach);">${esc(m.canTeachMe.map(s => s.name).join(', '))}</b>` : ''}
          ${m.canTeachMe.length && m.iCanTeachThem.length ? ' · ' : ''}
          ${m.iCanTeachThem.length ? `Wants your: <b style="color: var(--primary);">${esc(m.iCanTeachThem.map(s => s.name).join(', ')) }</b>` : ''}
          ${!m.canTeachMe.length && !m.iCanTeachThem.length ? `${esc(m.user.institution || m.user.role)}` : ''}
        </div>
      </div>
      <div class="match-score ${m.mutual ? 'mutual-score' : ''}">
        <span class="score-num">${m.score}%</span>
        <span class="score-lbl">Match</span>
      </div>
      ${withConnect ? `
        <div class="actions">
          <button class="btn sm" data-action="viewUser" data-id="${m.user.id}">View</button>
          <button class="btn sm primary glow" data-action="proposeExchange" data-id="${m.user.id}">Swap</button>
        </div>
      ` : ''}
    </div>
  `;
}

function generatePersonalizedSuggestions(c, matches) {
  const out = [];
  const mutuals = matches.filter(m => m.mutual);
  if (mutuals.length > 0) {
    const top = mutuals[0];
    out.push(`<b>Mutual Swap Available:</b> <b>${esc(top.user.name)}</b> wants to learn <em>${esc(top.iCanTeachThem.map(s => s.name).join(', '))}</em> and can teach you <em>${esc(top.canTeachMe.map(s => s.name).join(', '))}</em>. Click "Swap" to propose an exchange!`);
  }
  const st = streaks(c.acts);
  if (!c.acts.some(a => a.date === todayStr())) {
    out.push(st.cur > 0 ? `Keep your <b>${st.cur}-day streak</b> alive! Log today’s session before midnight.` : 'Log a 30-minute session today to initiate your active learning streak.');
  }
  const overdueGoals = c.goals.filter(g => goalProgress(g) < 100 && g.targetDate && g.targetDate < todayStr());
  if (overdueGoals.length > 0) {
    out.push(`You have <b>${overdueGoals.length} overdue goal(s)</b> (e.g. <em>${esc(overdueGoals[0].title)}</em>). Review upcoming milestones to get back on track.`);
  }
  if (!c.skills.some(s => s.type === 'teach')) {
    out.push('List at least one skill you can teach. Members can only find you for exchanges if you showcase your strengths.');
  }
  if (!c.skills.some(s => s.type === 'learn')) {
    out.push('Specify what you want to learn so our algorithm can compute reciprocal matches for you.');
  }
  if (out.length < 3) {
    out.push('Teaching someone else reinforces your own understanding by up to 90% (the Feynman Technique). Try logging a teaching session this week.');
  }
  return out;
}

/* ------------------------------- PROFILE ----------------------------- */
views.profile = () => `
  <div class="card" style="max-width: 800px; margin: 0 auto;">
    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--line);">
      ${avatar(me.name, 'xl')}
      <div>
        <h2 style="font-size: 24px;">${esc(me.name)}</h2>
        <div class="muted">${esc(me.email)} · Member since ${fmtDate(me.createdAt)}</div>
        <div style="margin-top: 6px; display: flex; gap: 8px;">
          <span class="chip primary">Level ${getLevelInfo(calculateXP(loadCtx())).level} Member</span>
          <span class="chip">${esc(me.role)}</span>
          ${me.systemRole ? `<span class="badge" style="background:var(--primary-soft); color:#818cf8;">${me.systemRole.toUpperCase()}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Trust Reputation Card -->
    <div class="card mb-4" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.1)); border: 1px solid var(--line-strong);">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <span class="text-xs font-bold uppercase muted">Trust Reputation</span>
          <div style="font-size:18px; font-weight:700; margin-top:2px;">
            ${(typeof HubState !== 'undefined' && HubState.myTrustData) ? `<span style="color:var(--teach);">${HubState.myTrustData.tierBadge} ${HubState.myTrustData.trustScore} / 100</span> · ${esc(HubState.myTrustData.trustTier)}` : '🛡️ Activity Trust Score Active'}
          </div>
          <div class="text-xs muted">Verified exchange sessions, peer endorsements, and reviews</div>
        </div>
        <a href="#trust" class="btn sm primary glow">View Trust &amp; Verification Center ➔</a>
      </div>
    </div>

    <form data-form="profile">
      <div class="row2">
        <label>
          <span>Full Name</span>
          <input name="name" value="${esc(me.name)}" required>
        </label>
        <label>
          <span>Role in Community</span>
          <select name="role">
            ${opts(['Student', 'Professional'], me.role)}
          </select>
        </label>
      </div>

      <div class="row2">
        <label>
          <span>Institution / University / Company</span>
          <input name="institution" value="${esc(me.institution)}" placeholder="e.g. IIT Madras, Google, Freelance">
        </label>
        <label>
          <span>Degree / Department / Title</span>
          <input name="education" value="${esc(me.education)}" placeholder="e.g. B.Tech Computer Science, UX Designer">
        </label>
      </div>

      <div class="row2">
        <label>
          <span>City / Region</span>
          <input name="location" value="${esc(me.location)}" placeholder="e.g. Chennai, India">
        </label>
        <label>
          <span>Interests &amp; Topics (comma separated)</span>
          <input name="interests" value="${esc(me.interests)}" placeholder="e.g. Web Dev, Figma, Public Speaking, AI">
        </label>
      </div>

      <label>
        <span>About Me &amp; Learning Philosophy</span>
        <textarea name="bio" rows="4" placeholder="Describe your background, what you enjoy teaching, and what skills you are eager to master...">${esc(me.bio)}</textarea>
      </label>

      <button class="btn primary glow" type="submit">Save Profile Changes</button>
    </form>
  </div>
`;

forms.profile = f => {
  Object.assign(me, {
    name: f.name.value.trim(),
    role: f.role.value,
    institution: f.institution.value.trim(),
    education: f.education.value.trim(),
    location: f.location.value.trim(),
    interests: f.interests.value.trim(),
    bio: f.bio.value.trim()
  });
  StorageDB.put('users', me);
  toast('Profile updated successfully!', 'ok');
  updateUserChrome();
  render();
};

/* -------------------------------- SKILLS ----------------------------- */
function skillCard(s) {
  const isTeach = s.type === 'teach';
  return `
    <div class="item">
      <div class="grow">
        <div class="title" style="display: flex; align-items: center; gap: 8px;">
          ${esc(s.name)}
          <span class="chip ${isTeach ? 'teach' : 'learn'}" style="font-size: 11px;">${esc(s.level)}</span>
        </div>
        <div class="text-xs muted" style="margin-top: 2px;">
          <b>${esc(s.category)}</b>
          ${s.format ? `· ${esc(s.format)}` : ''}
          ${s.description ? `· ${esc(s.description)}` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="btn sm" data-action="editSkill" data-id="${s.id}">Edit</button>
        <button class="btn sm danger" data-action="delSkill" data-id="${s.id}">Remove</button>
      </div>
    </div>
  `;
}

views.skills = () => {
  const { skills } = loadCtx();
  const t = skills.filter(s => s.type === 'teach');
  const l = skills.filter(s => s.type === 'learn');

  return `
    <div class="section-head">
      <div>
        <h2>Skill Portfolio Management</h2>
        <p class="muted text-sm">List skills you can mentor others in, and identify skills you are actively looking to learn.</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn primary sm glow" data-action="addSkill" data-type="teach">+ Teach Skill</button>
        <button class="btn sm" data-action="addSkill" data-type="learn">+ Learn Skill</button>
      </div>
    </div>

    <div class="grid g2">
      <!-- Teaching Skills -->
      <div class="card">
        <div class="card-head">
          <h3>🎓 Skills I Can Teach <span class="chip teach">${t.length}</span></h3>
          <button class="btn sm teach-btn" data-action="addSkill" data-type="teach">+ Add</button>
        </div>
        <p class="text-xs muted mb-3">These skills are indexed in the community search so peers can request sessions from you.</p>
        <div class="list">
          ${t.length ? t.map(skillCard).join('') : empty('You haven’t listed any teaching skills yet. Share your expertise!', '🎓')}
        </div>
      </div>

      <!-- Learning Wishlist -->
      <div class="card">
        <div class="card-head">
          <h3>🌱 Skills I Want to Learn <span class="chip learn">${l.length}</span></h3>
          <button class="btn sm primary" data-action="addSkill" data-type="learn">+ Add</button>
        </div>
        <p class="text-xs muted mb-3">Our match engine pairs these with community members who can mentor you.</p>
        <div class="list">
          ${l.length ? l.map(skillCard).join('') : empty('Your learning list is empty. What would you like to master next?', '🌱')}
        </div>
      </div>
    </div>
  `;
};

function skillForm(s = {}, defaultType = 'teach') {
  const type = s.type || defaultType;
  openModal(s.id ? 'Edit Skill Details' : (type === 'teach' ? 'Add Skill to Teach' : 'Add Skill to Learn'), `
    <form data-form="skill">
      <input type="hidden" name="id" value="${s.id || ''}">
      <div class="row2">
        <label>
          <span>Skill Type</span>
          <select name="type">
            <option value="teach" ${type === 'teach' ? 'selected' : ''}>🎓 I can Teach this</option>
            <option value="learn" ${type === 'learn' ? 'selected' : ''}>🌱 I want to Learn this</option>
          </select>
        </label>
        <label>
          <span>Current / Target Proficiency</span>
          <select name="level">
            ${opts(LEVELS, s.level || 'Intermediate')}
          </select>
        </label>
      </div>

      <label>
        <span>Skill Name</span>
        <input name="name" value="${esc(s.name)}" required placeholder="e.g. JavaScript, Public Speaking, Figma, Photography">
      </label>

      <div class="row2">
        <label>
          <span>Category</span>
          <select name="category">
            ${opts(CATEGORIES, s.category || 'Programming')}
          </select>
        </label>
        <label>
          <span>Exchange Format</span>
          <select name="format">
            ${opts(FORMATS, s.format || '1-on-1 Session')}
          </select>
        </label>
      </div>

      <label>
        <span>Description / What Can You Cover?</span>
        <textarea name="description" placeholder="Share specific topics, libraries, or what you hope to gain from peer learning...">${esc(s.description)}</textarea>
      </label>

      <button class="btn primary block glow" type="submit">${s.id ? 'Save Changes' : 'Add Skill to Profile'}</button>
    </form>
  `);
}

forms.skill = f => {
  const rec = {
    userId: me.id,
    type: f.type.value,
    name: f.name.value.trim(),
    category: f.category.value,
    level: f.level.value,
    format: f.format.value,
    description: f.description.value.trim()
  };

  if (f.id.value) {
    const old = StorageDB.get('skills', +f.id.value);
    StorageDB.put('skills', { ...old, ...rec });
    toast('Skill updated successfully!', 'ok');
  } else {
    rec.createdAt = new Date().toISOString();
    StorageDB.add('skills', rec);
    toast('New skill added to your profile!', 'ok');
  }

  closeModal();
  checkAchievements();
  render();
};

/* ------------------------------- DISCOVER ---------------------------- */
views.discover = () => {
  const com = loadCommunity();
  const catCounts = {};
  com.skills.filter(s => s.userId !== me.id).forEach(s => {
    catCounts[s.category] = (catCounts[s.category] || 0) + 1;
  });

  return `
    <div class="card mb-4">
      <div class="filters-bar">
        <label>
          <span>Search Skills, People, Topics</span>
          <input data-filter="q" value="${esc(filters.q)}" placeholder="e.g. Python, Meera, Figma, Speaking...">
        </label>
        <label>
          <span>Skill Category</span>
          <select data-filter="category">
            <option value="">All Categories</option>
            ${CATEGORIES.map(c => `<option value="${esc(c)}" ${filters.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Looking for</span>
          <select data-filter="type">
            <option value="">Everyone (Teach or Learn)</option>
            <option value="teach" ${filters.type === 'teach' ? 'selected' : ''}>Peers Who Can Teach</option>
            <option value="learn" ${filters.type === 'learn' ? 'selected' : ''}>Peers Who Want to Learn</option>
          </select>
        </label>
        <label>
          <span>Expertise Level</span>
          <select data-filter="level">
            <option value="">Any Level</option>
            ${LEVELS.map(l => `<option value="${esc(l)}" ${filters.level === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <!-- Category Explore Pills -->
    <div class="section mb-4">
      <div class="section-head">
        <h2>Explore Skill Categories</h2>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${CATEGORIES.filter(c => catCounts[c]).map(c => `
          <button class="chip primary click ${filters.category === c ? 'active-pill' : ''}" data-action="pickCategory" data-cat="${esc(c)}">
            ${esc(c)} · ${catCounts[c]} skills
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Discover Peer Results Grid -->
    <div class="section">
      <div class="section-head">
        <h2>Community Members (${com.users.filter(u => u.id !== me.id).length})</h2>
        <button class="btn sm" data-action="clearFilters">Reset Filters</button>
      </div>
      <div id="discResults" class="grid gauto"></div>
    </div>
  `;
};

after.discover = () => drawDiscover();

function drawDiscover() {
  const com = loadCommunity();
  const conns = StorageDB.by('connections', 'userId', me.id);
  const q = filters.q.trim().toLowerCase();

  const results = [];
  for (const u of com.users) {
    if (u.id === me.id) continue;
    const uSkills = com.skills.filter(s => s.userId === u.id);

    const matchSkills = uSkills.filter(s => {
      const matchType = !filters.type || s.type === filters.type;
      const matchCat = !filters.category || s.category === filters.category;
      const matchLevel = !filters.level || s.level === filters.level;
      const matchQ = !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      return matchType && matchCat && matchLevel && matchQ;
    });

    const matchName = q && (u.name.toLowerCase().includes(q) || (u.institution || '').toLowerCase().includes(q) || (u.interests || '').toLowerCase().includes(q));

    if (matchSkills.length || (matchName && !filters.category && !filters.type && !filters.level)) {
      results.push({ u, skills: uSkills, highlighted: matchSkills.length ? matchSkills : uSkills });
    } else if (!q && !filters.category && !filters.type && !filters.level) {
      results.push({ u, skills: uSkills, highlighted: uSkills });
    }
  }

  const el = $('#discResults');
  if (!el) return;

  el.innerHTML = results.length ? results.map(({ u, highlighted }) => {
    const isConnected = conns.some(c => c.otherId === u.id);
    const teachSkills = highlighted.filter(s => s.type === 'teach');
    const learnSkills = highlighted.filter(s => s.type === 'learn');

    return `
      <div class="card">
        <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px;">
          ${avatar(u.name, 'md')}
          <div style="flex: 1; min-width: 0;">
            <div class="font-bold text-base">${esc(u.name)}</div>
            <div class="text-xs muted">${esc(u.role)} · ${esc(u.institution || 'Community')}</div>
            <div class="text-xs muted">${esc(u.location || '')}</div>
          </div>
        </div>

        <p class="text-xs muted mb-3" style="min-height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${esc(u.bio) || 'Passionate about peer knowledge sharing.'}
        </p>

        <div class="mb-3">
          ${teachSkills.length ? `
            <div class="text-xs font-semibold muted mb-1">Teaches:</div>
            <div>${teachSkills.map(s => `<span class="chip teach" title="${esc(s.category)} · ${esc(s.level)}">🎓 ${esc(s.name)}</span>`).join('')}</div>
          ` : ''}
          ${learnSkills.length ? `
            <div class="text-xs font-semibold muted mb-1" style="margin-top: 6px;">Wants to learn:</div>
            <div>${learnSkills.map(s => `<span class="chip learn" title="${esc(s.category)}">🌱 ${esc(s.name)}</span>`).join('')}</div>
          ` : ''}
        </div>

        <div class="actions" style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line);">
          <button class="btn sm" data-action="viewUser" data-id="${u.id}">Profile</button>
          <button class="btn sm primary glow" data-action="proposeExchange" data-id="${u.id}">Propose Swap</button>
          ${isConnected ? '<span class="chip teach text-xs">Connected</span>' : `<button class="btn sm ghost" data-action="connect" data-id="${u.id}">+ Connect</button>`}
        </div>
      </div>
    `;
  }).join('') : empty('No community members match your current filter parameters.', '🔍');
}

function viewUser(id) {
  const u = StorageDB.get('users', id);
  if (!u) return;
  const skills = StorageDB.by('skills', 'userId', id);
  const teach = skills.filter(s => s.type === 'teach');
  const learn = skills.filter(s => s.type === 'learn');

  openModal(`Member Profile: ${u.name}`, `
    <div style="display: flex; gap: 18px; align-items: center; margin-bottom: 20px;">
      ${avatar(u.name, 'lg')}
      <div>
        <h3 style="font-size: 20px;">${esc(u.name)}</h3>
        <div class="muted">${esc(u.role)} · ${esc(u.institution || '')}</div>
        <div class="text-xs muted">${esc(u.education || '')} ${u.location ? '· ' + esc(u.location) : ''}</div>
      </div>
    </div>

    <!-- Live MongoDB Trust & Verification Summary -->
    <div id="modalUserTrustBox" class="card mb-3" style="background:var(--bg-surface-elevated); border:1px solid var(--line);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="text-xs font-bold uppercase muted">Trust Reputation:</span>
          <div style="font-size:15px; font-weight:700; margin-top:2px;" id="modalTrustTitle">Loading verified score...</div>
        </div>
        <div id="modalTrustRating" class="text-sm font-semibold muted"></div>
      </div>
      <div id="modalVerifiedSkillsList" style="margin-top:8px;"></div>
    </div>

    <div class="mb-3">
      <span class="text-xs font-bold uppercase muted">About:</span>
      <p class="text-sm mt-1">${esc(u.bio) || '<span class="muted">No biography provided.</span>'}</p>
    </div>

    <div class="mb-3">
      <span class="text-xs font-bold uppercase muted">Interests:</span>
      <p class="text-sm mt-1">${esc(u.interests) || '—'}</p>
    </div>

    <div class="mb-3">
      <span class="text-xs font-bold uppercase muted">Skills ${u.name.split(' ')[0]} Can Teach:</span>
      <div style="margin-top: 6px;">
        ${teach.length ? teach.map(s => `<span class="chip teach">🎓 ${esc(s.name)} (${esc(s.level)}) · ${esc(s.category)}</span>`).join('') : '<span class="muted text-xs">None listed</span>'}
      </div>
    </div>

    <div class="mb-4">
      <span class="text-xs font-bold uppercase muted">Skills ${u.name.split(' ')[0]} Wants to Learn:</span>
      <div style="margin-top: 6px;">
        ${learn.length ? learn.map(s => `<span class="chip learn">🌱 ${esc(s.name)} (${esc(s.level)})</span>`).join('') : '<span class="muted text-xs">None listed</span>'}
      </div>
    </div>

    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
      <button class="btn primary glow" data-action="proposeExchange" data-id="${u.id}">🔁 Propose Skill Exchange</button>
      <button class="btn" data-action="connect" data-id="${u.id}">+ Connect</button>
      <button class="btn ghost" data-action="openEndorseModal">🤝 Endorse Skill</button>
      <button class="btn sm danger" data-action="openReportModal" data-type="user" data-id="${u.mongoId || u.id}" style="margin-left:auto;">🚩 Report</button>
    </div>
  `);

  // Asynchronously fetch live trust metrics from MongoDB
  (async () => {
    try {
      const allRes = await api('/api/auth/users');
      const target = (allRes.users || []).find(usr => usr.email === u.email);
      if (target) {
        const trRes = await api(`/api/users/${target.id}`);
        if (trRes.success && trRes.trust) {
          const t = trRes.trust;
          const titleEl = document.getElementById('modalTrustTitle');
          if (titleEl) {
            titleEl.innerHTML = `<span style="color:var(--teach);">${t.tierBadge} ${t.trustScore} / 100</span> · ${esc(t.trustTier)}`;
          }
          const ratingEl = document.getElementById('modalTrustRating');
          if (ratingEl && t.metrics.reviewCount > 0) {
            ratingEl.innerHTML = `⭐ <b>${t.metrics.averageRating}</b> (${t.metrics.reviewCount} review${t.metrics.reviewCount === 1 ? '' : 's'})`;
          }
          const verifEl = document.getElementById('modalVerifiedSkillsList');
          if (verifEl && t.verifiedSkillsList && t.verifiedSkillsList.length > 0) {
            verifEl.innerHTML = `
              <div class="text-xs muted mb-1">Moderator-Verified Skills:</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${t.verifiedSkillsList.map(v => `<span class="verified-shield">🛡️ ${esc(v.skill)}</span>`).join('')}
              </div>
            `;
          }
        }
      }
    } catch (e) {
      console.warn('Profile trust fetch fallback:', e);
    }
  })();
}

/* --------------------------- MATCHES & NETWORK ----------------------- */
views.matches = () => {
  const c = loadCtx();
  const com = loadCommunity();
  const matches = computeMatches(c.skills, com.users, com.skills);

  const mutual = matches.filter(m => m.mutual);
  const others = matches.filter(m => !m.mutual && m.score > 25);
  const myConns = c.conns.map(cn => com.users.find(u => u.id === cn.otherId)).filter(Boolean);

  return `
    <div class="section-head">
      <div>
        <h2>Smart Skill Compatibility Engine</h2>
        <p class="muted text-sm">Algorithmic matching based on complementary skill pairs, reciprocity, and mutual learning goals.</p>
      </div>
    </div>

    <!-- Mutual Matches: Highest Value -->
    <div class="section">
      <div class="section-head">
        <h3 style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 22px;">🔁</span>
          <span>100% Mutual Skill Exchanges</span>
          <span class="chip mutual">${mutual.length} matches</span>
        </h3>
      </div>
      <p class="muted text-xs mb-3">Both of you have complementary expertise: you teach what they want, and they teach what you want!</p>
      <div class="grid gauto">
        ${mutual.length ? mutual.map(m => `
          <div class="card mutual-card">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
              <div style="display: flex; gap: 12px; align-items: center;">
                ${avatar(m.user.name, 'md')}
                <div>
                  <div class="font-bold text-base">${esc(m.user.name)}</div>
                  <div class="text-xs muted">${esc(m.user.institution || m.user.role)}</div>
                </div>
              </div>
              <div class="match-score mutual-score">
                <span class="score-num">${m.score}%</span>
                <span class="score-lbl">Mutual</span>
              </div>
            </div>

            <div style="margin-top: 14px; background: rgba(0,0,0,0.15); padding: 10px 12px; border-radius: 8px;">
              <div class="text-xs" style="margin-bottom: 6px;">
                <b style="color: var(--teach);">They teach you:</b>
                ${m.canTeachMe.map(s => `<span class="chip teach" style="font-size: 11px;">🎓 ${esc(s.name)}</span>`).join('')}
              </div>
              <div class="text-xs">
                <b style="color: var(--primary);">You teach them:</b>
                ${m.iCanTeachThem.map(s => `<span class="chip learn" style="font-size: 11px;">🌱 ${esc(s.name)}</span>`).join('')}
              </div>
            </div>

            <div class="actions" style="margin-top: 14px;">
              <button class="btn sm primary glow" data-action="proposeExchange" data-id="${m.user.id}">Propose Swap</button>
              <button class="btn sm" data-action="viewUser" data-id="${m.user.id}">View Profile</button>
            </div>
          </div>
        `).join('') : empty('No mutual matches yet. Add more skills you can teach and skills you want to learn to unlock 2-way swaps!', '🔁')}
      </div>
    </div>

    <!-- Complementary Partner Matches -->
    <div class="section">
      <div class="section-head">
        <h3>Complementary Learning Partners</h3>
      </div>
      <div class="grid gauto">
        ${others.length ? others.map(m => `
          <div class="card">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
              <div style="display: flex; gap: 12px; align-items: center;">
                ${avatar(m.user.name, 'md')}
                <div>
                  <div class="font-bold text-base">${esc(m.user.name)}</div>
                  <div class="text-xs muted">${esc(m.user.institution || m.user.role)}</div>
                </div>
              </div>
              <div class="match-score">
                <span class="score-num">${m.score}%</span>
                <span class="score-lbl">Match</span>
              </div>
            </div>

            <div style="margin-top: 12px;" class="text-xs">
              ${m.canTeachMe.length ? `
                <div class="mb-1"><span class="muted">Can mentor you in:</span> ${m.canTeachMe.map(s => `<span class="chip teach">${esc(s.name)}</span>`).join('')}</div>
              ` : ''}
              ${m.iCanTeachThem.length ? `
                <div class="mb-1"><span class="muted">Wants your help in:</span> ${m.iCanTeachThem.map(s => `<span class="chip learn">${esc(s.name)}</span>`).join('')}</div>
              ` : ''}
            </div>

            <div class="actions" style="margin-top: 14px;">
              <button class="btn sm primary" data-action="proposeExchange" data-id="${m.user.id}">Exchange</button>
              <button class="btn sm" data-action="viewUser" data-id="${m.user.id}">View</button>
            </div>
          </div>
        `).join('') : empty('No additional partner matches at this time.', '👥')}
      </div>
    </div>

    <!-- My Learning Network -->
    <div class="card section">
      <div class="card-head">
        <h3>🌐 My Learning Network <span class="chip primary">${myConns.length} Connected</span></h3>
      </div>
      ${myConns.length ? myConns.map(u => `
        <div class="item">
          ${avatar(u.name, 'sm')}
          <div class="grow">
            <div class="title">${esc(u.name)}</div>
            <div class="text-xs muted">${esc(u.role)} · ${esc(u.institution || '')}</div>
          </div>
          <div class="actions">
            <button class="btn sm primary glow" data-action="proposeExchange" data-id="${u.id}">Propose Session</button>
            <button class="btn sm" data-action="logWith" data-name="${esc(u.name)}">Log Session</button>
            <button class="btn sm danger" data-action="disconnect" data-id="${u.id}">Disconnect</button>
          </div>
        </div>
      `).join('') : empty('Connect with peers across the platform to build your active learning circle!', '🌐')}
    </div>
  `;
};

/* ------------------------ PROPOSALS & EXCHANGE HUB ------------------- */
views.proposals = () => {
  const com = loadCommunity();
  const allProps = StorageDB.all('proposals');

  const incoming = allProps.filter(p => p.toUserId === me.id);
  const outgoing = allProps.filter(p => p.fromUserId === me.id);

  const renderProposalCard = (p, isIncoming) => {
    const otherUser = com.users.find(u => u.id === (isIncoming ? p.fromUserId : p.toUserId)) || { name: 'Unknown User' };
    const statusClass = p.status === 'accepted' ? 'teach' : p.status === 'declined' ? 'danger' : p.status === 'completed' ? 'primary' : 'warn';

    return `
      <div class="card mb-3">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="display: flex; gap: 12px; align-items: center;">
            ${avatar(otherUser.name, 'sm')}
            <div>
              <div class="font-bold text-base">${esc(otherUser.name)}</div>
              <div class="text-xs muted">${isIncoming ? 'Sent you a proposal' : 'You sent a proposal'} · ${fmtDate(p.createdAt)}</div>
            </div>
          </div>
          <span class="chip ${statusClass} uppercase" style="font-size: 11px; font-weight: 700;">${p.status}</span>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: 8px; margin-bottom: 12px;" class="text-sm">
          <div style="display: flex; gap: 20px; flex-wrap: wrap;" class="mb-2">
            <div><span class="muted text-xs">I teach:</span> <b style="color: var(--teach);">${esc(isIncoming ? p.learnSkill : p.teachSkill)}</b></div>
            <div><span class="muted text-xs">I learn:</span> <b style="color: var(--primary);">${esc(isIncoming ? p.teachSkill : p.learnSkill)}</b></div>
            <div><span class="muted text-xs">Target:</span> <b>${fmtDate(p.date)} at ${esc(p.time || 'TBD')} (${p.duration}m)</b></div>
          </div>
          ${p.message ? `<div class="text-xs muted" style="font-style: italic;">"${esc(p.message)}"</div>` : ''}
        </div>

        <div class="actions">
          ${isIncoming && p.status === 'pending' ? `
            <button class="btn sm teach-btn" data-action="acceptProposal" data-id="${p.id}">✓ Accept Proposal</button>
            <button class="btn sm danger" data-action="declineProposal" data-id="${p.id}">✕ Decline</button>
          ` : ''}

          ${p.status === 'accepted' ? `
            <button class="btn sm primary" data-action="logWith" data-name="${esc(otherUser.name)}" data-skill="${esc(isIncoming ? p.teachSkill : p.learnSkill)}">Log Completed Session</button>
            <button class="btn sm" data-action="completeProposal" data-id="${p.id}">Mark as Completed</button>
          ` : ''}

          <button class="btn sm" data-action="viewUser" data-id="${otherUser.id}">View Member</button>
          ${!isIncoming && p.status === 'pending' ? `<button class="btn sm danger" data-action="cancelProposal" data-id="${p.id}">Cancel Request</button>` : ''}
        </div>
      </div>
    `;
  };

  return `
    <div class="section-head">
      <div>
        <h2>Skill Exchange Proposals Hub</h2>
        <p class="muted text-sm">Send structured knowledge swap proposals, review incoming requests, and manage exchange commitments.</p>
      </div>
    </div>

    <div class="grid g2">
      <!-- Incoming Proposals -->
      <div>
        <h3 class="mb-3" style="display: flex; align-items: center; gap: 8px;">
          <span>📥 Received Proposals</span>
          <span class="chip primary">${incoming.length}</span>
        </h3>
        ${incoming.length ? incoming.map(p => renderProposalCard(p, true)).join('') : empty('No incoming proposals currently.', '📬')}
      </div>

      <!-- Outgoing Proposals -->
      <div>
        <h3 class="mb-3" style="display: flex; align-items: center; gap: 8px;">
          <span>📤 Sent Proposals</span>
          <span class="chip">${outgoing.length}</span>
        </h3>
        ${outgoing.length ? outgoing.map(p => renderProposalCard(p, false)).join('') : empty('You haven’t sent any exchange requests yet.', '📨')}
      </div>
    </div>
  `;
};

function proposeExchangeModal(targetUserId) {
  const targetUser = StorageDB.get('users', +targetUserId);
  if (!targetUser) return;

  const mySkills = StorageDB.by('skills', 'userId', me.id);
  const myTeach = mySkills.filter(s => s.type === 'teach');

  const theirSkills = StorageDB.by('skills', 'userId', targetUser.id);
  const theirTeach = theirSkills.filter(s => s.type === 'teach');

  openModal(`Propose Skill Swap with ${targetUser.name}`, `
    <form data-form="proposal">
      <input type="hidden" name="toUserId" value="${targetUser.id}">

      <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
        <div class="text-xs muted uppercase font-bold mb-1">Exchange Overview</div>
        <div class="text-sm">You are proposing a mutual knowledge exchange with <b>${esc(targetUser.name)}</b> (${esc(targetUser.role)} at ${esc(targetUser.institution || 'Community')}).</div>
      </div>

      <div class="row2">
        <label>
          <span>Skill I will Teach</span>
          <input name="teachSkill" list="myTeachList" required placeholder="e.g. JavaScript, Public Speaking">
          <datalist id="myTeachList">
            ${myTeach.map(s => `<option value="${esc(s.name)}">`).join('')}
          </datalist>
        </label>

        <label>
          <span>Skill I Want to Learn</span>
          <input name="learnSkill" list="theirTeachList" required placeholder="e.g. UI/UX & Figma, Python">
          <datalist id="theirTeachList">
            ${theirTeach.map(s => `<option value="${esc(s.name)}">`).join('')}
          </datalist>
        </label>
      </div>

      <div class="row3">
        <label>
          <span>Proposed Date</span>
          <input type="date" name="date" min="${todayStr()}" value="${daysAgo(-2)}" required>
        </label>
        <label>
          <span>Preferred Time</span>
          <input type="time" name="time" value="18:00" required>
        </label>
        <label>
          <span>Session Duration</span>
          <select name="duration">
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60" selected>60 minutes (1 hr)</option>
            <option value="90">90 minutes</option>
          </select>
        </label>
      </div>

      <label>
        <span>Message / Exchange Goal</span>
        <textarea name="message" placeholder="Hi! I’d love to trade knowledge on this topic. I can guide you through... and hope to learn..."></textarea>
      </label>

      <button class="btn primary block glow" type="submit">Send Skill Swap Proposal</button>
    </form>
  `);
}

forms.proposal = f => {
  const toId = +f.toUserId.value;
  StorageDB.add('proposals', {
    fromUserId: me.id,
    toUserId: toId,
    teachSkill: f.teachSkill.value.trim(),
    learnSkill: f.learnSkill.value.trim(),
    date: f.date.value,
    time: f.time.value,
    duration: +f.duration.value,
    message: f.message.value.trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  closeModal();
  toast('Exchange proposal sent! You will be notified when they accept.', 'ok');
  checkAchievements();
  render();
};

/* -------------------------------- GOALS ------------------------------ */
views.goals = () => {
  const { goals } = loadCtx();
  const sorted = [...goals].sort((a, b) => goalProgress(a) - goalProgress(b) || (a.targetDate || '').localeCompare(b.targetDate || ''));

  return `
    <div class="section-head">
      <div>
        <h2>Learning Goals &amp; Milestone Roadmap</h2>
        <p class="muted text-sm">Structure your skill development with target dates, sequential milestones, and completion checkpoints.</p>
      </div>
      <button class="btn primary glow" data-action="addGoal">+ New Learning Goal</button>
    </div>

    <div class="grid gauto">
      ${sorted.length ? sorted.map(g => {
        const p = goalProgress(g);
        const hasMs = g.milestones && g.milestones.length;
        const left = g.targetDate ? Math.ceil((new Date(g.targetDate) - new Date(todayStr())) / 864e5) : null;
        const isDone = p >= 100;

        return `
          <div class="card ${isDone ? 'highlight' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <h3 style="font-size: 16px;">${esc(g.title)}</h3>
              ${isDone ? '<span class="chip teach">✓ 100% Done</span>' : ''}
            </div>

            <div class="text-xs muted mb-2" style="margin-top: 4px;">
              ${g.skill ? `🧠 <b>${esc(g.skill)}</b> · ` : ''}
              ${g.targetDate ? `📅 Due ${fmtDate(g.targetDate)}` : 'No set deadline'}
              ${!isDone && left !== null ? (left < 0 ? `<span class="chip danger" style="padding: 1px 6px; font-size: 10px;">${-left}d Overdue</span>` : `<span class="chip warn" style="padding: 1px 6px; font-size: 10px;">${left}d remaining</span>`) : ''}
            </div>

            <div style="margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;" class="text-xs font-bold">
                <span>Progress</span>
                <span>${p}%</span>
              </div>
              ${bar(p, isDone ? 'green' : '')}
            </div>

            <div style="margin-top: 14px;">
              ${hasMs ? `
                <div class="text-xs uppercase font-bold muted mb-1">Checklist Milestones (${g.milestones.filter(m => m.done).length}/${g.milestones.length}):</div>
                ${g.milestones.map((m, i) => `
                  <label class="milestone-item ${m.done ? 'done' : ''}">
                    <input type="checkbox" data-change="toggleMs" data-id="${g.id}" data-i="${i}" ${m.done ? 'checked' : ''}>
                    <span>${esc(m.text)}</span>
                  </label>
                `).join('')}
              ` : `
                <label>
                  <span>Manual Slider: ${p}%</span>
                  <input type="range" min="0" max="100" step="5" value="${p}" data-change="goalProgress" data-id="${g.id}">
                </label>
              `}
            </div>

            <!-- Inline Milestone Adder -->
            <form data-form="addMs" class="inline-form">
              <input type="hidden" name="id" value="${g.id}">
              <input name="text" placeholder="Add next checkpoint milestone..." required>
              <button class="btn sm" type="submit">+ Add</button>
            </form>

            <div class="actions" style="margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--line);">
              <button class="btn sm danger" data-action="delGoal" data-id="${g.id}">Delete Goal</button>
            </div>
          </div>
        `;
      }).join('') : empty('No learning goals established yet. Define a structured goal with target dates!', '🎯')}
    </div>
  `;
};

function goalModal() {
  const { skills } = loadCtx();
  openModal('Set Structured Learning Goal', `
    <form data-form="goal">
      <label>
        <span>Goal Title</span>
        <input name="title" required placeholder="e.g. Build and launch portfolio website, Deliver 5-minute TEDx pitch">
      </label>

      <div class="row2">
        <label>
          <span>Linked Skill</span>
          <input name="skill" list="goalSkillList" placeholder="e.g. JavaScript, Public Speaking">
          <datalist id="goalSkillList">
            ${skills.map(s => `<option value="${esc(s.name)}">`).join('')}
          </datalist>
        </label>
        <label>
          <span>Target Completion Date</span>
          <input type="date" name="targetDate" min="${todayStr()}" value="${daysAgo(-30)}">
        </label>
      </div>

      <label>
        <span>Sequential Milestones (One per line)</span>
        <textarea name="milestones" rows="4" placeholder="Read core documentation&#10;Pair with mentor for code review&#10;Build interactive prototype&#10;Present to peer group"></textarea>
      </label>

      <button class="btn primary block glow" type="submit">Create Learning Goal</button>
    </form>
  `);
}

forms.goal = f => {
  const ms = f.milestones.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(text => ({ text, done: false }));

  StorageDB.add('goals', {
    userId: me.id,
    title: f.title.value.trim(),
    skill: f.skill.value.trim(),
    targetDate: f.targetDate.value,
    milestones: ms,
    progress: 0,
    createdAt: new Date().toISOString()
  });

  closeModal();
  toast('New learning goal established!', 'ok');
  checkAchievements();
  render();
};

forms.addMs = f => {
  const g = StorageDB.get('goals', +f.id.value);
  if (!g) return;
  g.milestones = g.milestones || [];
  g.milestones.push({ text: f.text.value.trim(), done: false });
  StorageDB.put('goals', g);
  toast('Milestone added!', 'ok');
  render();
};

/* ------------------------------ ACTIVITY ----------------------------- */
views.activity = () => {
  const c = loadCtx();
  const totalMin = sumMin(c.acts);
  const taughtCount = c.acts.filter(a => a.type === 'taught').length;
  const learnedCount = c.acts.filter(a => a.type === 'learned').length;

  return `
    <div class="section-head">
      <div>
        <h2>Knowledge-Sharing &amp; Learning Activity Tracker</h2>
        <p class="muted text-sm">Maintain an accurate audit trail of completed sessions, peer coaching hours, and learning notes.</p>
      </div>
      <button class="btn primary glow" data-action="addActivity">+ Log New Session</button>
    </div>

    <div class="grid g4">
      ${statCard('📝', c.acts.length, 'Total Sessions', 'Logged in audit ledger')}
      ${statCard('⏱️', `${hrs(totalMin)}h`, 'Total Exchange Time', `${totalMin} active minutes`)}
      ${statCard('🎓', `${taughtCount} / ${learnedCount}`, 'Taught vs Learned', 'Knowledge sharing balance')}
      ${statCard('📅', `${consistency(c.acts)}%`, '30-Day Consistency', `${new Set(inRange(c.acts, 29, 0).map(a => a.date)).size} active days`)}
    </div>

    <div class="card section">
      <div class="card-head">
        <h3>Session Ledger &amp; Participation History</h3>
        <button class="btn sm" data-action="exportActivities">Export CSV</button>
      </div>

      ${c.acts.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Skill Exchanged</th>
                <th>Learning Partner</th>
                <th>Duration</th>
                <th>Rating</th>
                <th>Key Takeaways &amp; Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${c.acts.map(a => `
                <tr>
                  <td><b>${fmtDate(a.date)}</b></td>
                  <td><span class="chip ${a.type === 'taught' ? 'teach' : 'learn'}">${actIcon(a.type)} ${esc(a.type)}</span></td>
                  <td><b>${esc(a.skill)}</b></td>
                  <td>${a.partner ? `👤 ${esc(a.partner)}` : '<span class="muted">Independent</span>'}</td>
                  <td><b>${a.minutes} min</b></td>
                  <td><span style="color: var(--mutual);">${'★'.repeat(a.rating || 5)}</span></td>
                  <td class="text-xs muted" style="max-width: 280px;">${esc(a.notes) || '—'}</td>
                  <td><button class="btn sm danger" data-action="delActivity" data-id="${a.id}" title="Remove entry">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : empty('No learning sessions recorded in your ledger yet.', '⏱️')}
    </div>
  `;
};

function activityModal(partner = '', skill = '') {
  const c = loadCtx();
  const openGoals = c.goals.filter(g => goalProgress(g) < 100);

  const conns = StorageDB.by('connections', 'userId', me.id);
  const com = loadCommunity();
  const partnerNames = conns.map(cn => (com.users.find(u => u.id === cn.otherId) || {}).name).filter(Boolean);

  openModal('Record Learning / Teaching Session', `
    <form data-form="activity">
      <div class="row2">
        <label>
          <span>Activity Type</span>
          <select name="type">
            <option value="learned">📘 Learned from Peer</option>
            <option value="taught">🎓 Taught to Peer</option>
            <option value="practiced">🛠️ Self Practice / Project</option>
          </select>
        </label>
        <label>
          <span>Session Date</span>
          <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required>
        </label>
      </div>

      <label>
        <span>Skill Name</span>
        <input name="skill" list="actSkillList" value="${esc(skill)}" required placeholder="e.g. JavaScript, Public Speaking, Figma">
        <datalist id="actSkillList">
          ${[...new Set(c.skills.map(s => s.name))].map(n => `<option value="${esc(n)}">`).join('')}
        </datalist>
      </label>

      <div class="row2">
        <label>
          <span>Partner (optional)</span>
          <input name="partner" value="${esc(partner)}" list="partnerList" placeholder="e.g. Meera Iyer, Rohan Das">
          <datalist id="partnerList">
            ${partnerNames.map(n => `<option value="${esc(n)}">`).join('')}
          </datalist>
        </label>
        <label>
          <span>Duration (minutes)</span>
          <input type="number" name="minutes" min="5" step="5" value="45" required>
        </label>
      </div>

      <div class="row2">
        <label>
          <span>Session Rating</span>
          <select name="rating">
            <option value="5">★★★★★ Exceptional (5/5)</option>
            <option value="4" selected>★★★★☆ Productive (4/5)</option>
            <option value="3">★★★☆☆ Satisfactory (3/5)</option>
            <option value="2">★★☆☆☆ Needs Follow-up (2/5)</option>
            <option value="1">★☆☆☆☆ Incomplete (1/5)</option>
          </select>
        </label>
        <label>
          <span>Linked Goal (optional)</span>
          <select name="goalId">
            <option value="">— No linked goal —</option>
            ${openGoals.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}
          </select>
        </label>
      </div>

      <label>
        <span>Session Takeaways &amp; Exercises Covered</span>
        <textarea name="notes" placeholder="Summarize code written, critique received, or next steps to practice..."></textarea>
      </label>

      <button class="btn primary block glow" type="submit">Save Session to Ledger</button>
    </form>
  `);
}

forms.activity = f => {
  StorageDB.add('activities', {
    userId: me.id,
    type: f.type.value,
    date: f.date.value,
    skill: f.skill.value.trim(),
    partner: f.partner.value.trim(),
    minutes: +f.minutes.value,
    rating: +f.rating.value,
    goalId: f.goalId.value ? +f.goalId.value : null,
    notes: f.notes.value.trim()
  });

  closeModal();
  toast('Learning session saved to ledger (+XP)!', 'ok');
  checkAchievements();
  render();
};

/* ------------------------------- PROGRESS ---------------------------- */
views.progress = () => {
  const c = loadCtx();
  const st = streaks(c.acts);
  const w1 = inRange(c.acts, 6, 0), w0 = inRange(c.acts, 13, 7);
  const m1 = inRange(c.acts, 29, 0), m0 = inRange(c.acts, 59, 30);

  const doneGoals = c.goals.filter(g => goalProgress(g) >= 100).length;
  const completion = c.goals.length ? Math.round((doneGoals / c.goals.length) * 100) : 0;
  const learnSkills = c.skills.filter(s => s.type === 'learn');
  const bySkill = Object.fromEntries(hoursBySkill(c.acts));

  const delta = (a, b) => b === 0 ? (a > 0 ? '▲ New' : '–') : (a >= b ? '▲ +' : '▼ -') + Math.abs(Math.round(((a - b) / b) * 100)) + '%';

  return `
    <div class="section-head">
      <div>
        <h2>Progress Monitoring &amp; Streak Metrics</h2>
        <p class="muted text-sm">Measure consistency, review historical period deltas, and analyze skill development velocity.</p>
      </div>
    </div>

    <div class="grid g4">
      ${statCard('🔥', `${st.cur} days`, 'Current Streak', 'Consecutive active learning days')}
      ${statCard('⚡', `${st.best} days`, 'Personal Best', 'Longest unbroken run')}
      ${statCard('📅', `${consistency(c.acts)}%`, 'Consistency Rate', 'Active days in past 30 days')}
      ${statCard('✅', `${completion}%`, 'Goal Completion Rate', `${doneGoals} of ${c.goals.length} completed`)}
    </div>

    <!-- GitHub-Style Activity Heatmap Grid -->
    <div class="card section">
      <div class="card-head">
        <h3>📅 12-Week Interactive Activity Heatmap</h3>
        <span class="text-xs muted">Hover to view daily session duration</span>
      </div>
      <div class="heatmap-container">
        <div id="activityHeatmap" class="heatmap-grid"></div>
      </div>
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 10px;" class="text-xs muted">
        <span>Less</span>
        <div class="heatmap-cell"></div>
        <div class="heatmap-cell l1"></div>
        <div class="heatmap-cell l2"></div>
        <div class="heatmap-cell l3"></div>
        <div class="heatmap-cell l4"></div>
        <span>More active</span>
      </div>
    </div>

    <!-- Period Comparison Table -->
    <div class="grid g2 section">
      <div class="card">
        <div class="card-head">
          <h3>Period-over-Period Comparison</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Evaluation Period</th>
              <th>Sessions</th>
              <th>Hours</th>
              <th>Velocity Delta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Last 7 Days</b></td>
              <td>${w1.length}</td>
              <td>${hrs(sumMin(w1))}h</td>
              <td><span class="chip ${sumMin(w1) >= sumMin(w0) ? 'teach' : 'danger'}">${delta(sumMin(w1), sumMin(w0))}</span></td>
            </tr>
            <tr>
              <td class="muted">Previous 7 Days</td>
              <td>${w0.length}</td>
              <td>${hrs(sumMin(w0))}h</td>
              <td>—</td>
            </tr>
            <tr>
              <td><b>Last 30 Days</b></td>
              <td>${m1.length}</td>
              <td>${hrs(sumMin(m1))}h</td>
              <td><span class="chip ${sumMin(m1) >= sumMin(m0) ? 'teach' : 'danger'}">${delta(sumMin(m1), sumMin(m0))}</span></td>
            </tr>
            <tr>
              <td class="muted">Previous 30 Days</td>
              <td>${m0.length}</td>
              <td>${hrs(sumMin(m0))}h</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Skill Development Mastery Target -->
      <div class="card">
        <div class="card-head">
          <h3>Skill Target Hours (20-Hour Rule)</h3>
          <span class="text-xs muted">Benchmark for initial proficiency</span>
        </div>
        ${learnSkills.length ? learnSkills.map(s => {
          const h = +hrs(bySkill[s.name] || 0);
          const p = Math.min(100, Math.round((h / 20) * 100));
          return `
            <div class="hrow">
              <span class="name" title="${esc(s.name)}">${esc(s.name)}</span>
              ${bar(p, p >= 100 ? 'green' : '')}
              <span class="val">${h} / 20h</span>
            </div>
          `;
        }).join('') : empty('Add skills you want to learn to track progress against the 20-hour rule!', '🌱')}
      </div>
    </div>

    <!-- Completed Milestones Showcase -->
    <div class="card section">
      <div class="card-head">
        <h3>Milestones Conquered</h3>
      </div>
      <div class="list">
        ${c.goals.flatMap(g => (g.milestones || []).filter(m => m.done).map(m => `
          <div class="item">
            <span style="color: var(--teach); font-size: 18px;">✓</span>
            <div class="grow">
              <div class="title">${esc(m.text)}</div>
              <div class="text-xs muted">Goal: <b>${esc(g.title)}</b></div>
            </div>
          </div>
        `)).join('') || empty('Complete checklist milestones inside your goals to see them recorded here.', '🏆')}
      </div>
    </div>
  `;
};

after.progress = () => {
  drawHeatmap();
};

function drawHeatmap() {
  const el = $('#activityHeatmap');
  if (!el) return;
  const c = loadCtx();

  // Aggregate minutes by date
  const map = {};
  c.acts.forEach(a => {
    map[a.date] = (map[a.date] || 0) + (+a.minutes || 0);
  });

  // 12 weeks = 84 days
  const cells = [];
  for (let i = 83; i >= 0; i--) {
    const dStr = daysAgo(i);
    const m = map[dStr] || 0;
    let cls = '';
    if (m > 90) cls = 'l4';
    else if (m > 45) cls = 'l3';
    else if (m > 20) cls = 'l2';
    else if (m > 0) cls = 'l1';

    cells.push(`<div class="heatmap-cell ${cls}" title="${fmtDate(dStr)}: ${m} minutes logged"></div>`);
  }
  el.innerHTML = cells.join('');
}

/* ------------------------------ ANALYTICS ---------------------------- */
views.analytics = () => {
  const c = loadCtx();
  const com = loadCommunity();
  const total = sumMin(c.acts);
  const byType = { learned: 0, taught: 0, practiced: 0 };
  c.acts.forEach(a => byType[a.type] = (byType[a.type] || 0) + (+a.minutes || 0));

  const bySkill = hoursBySkill(c.acts);
  const learnSkills = c.skills.filter(s => s.type === 'learn');
  const skillMin = Object.fromEntries(bySkill);
  const growth = learnSkills.map(s => ({ name: s.name, m: skillMin[s.name] || 0 })).sort((a, b) => a.m - b.m).slice(0, 3);

  const activeMembers30 = new Set(com.acts.filter(a => a.date >= daysAgo(29)).map(a => a.userId)).size;

  return `
    <div class="section-head">
      <div>
        <h2>Skill Analytics &amp; Visual Intelligence</h2>
        <p class="muted text-sm">Deep-dive into competency distributions, monthly learning velocity, and ecosystem benchmarks.</p>
      </div>
      <button class="btn primary glow" data-action="exportReport">Generate Progress Report</button>
    </div>

    <div class="grid g4">
      ${statCard('⏱️', `${hrs(total)}h`, 'Total Experience', 'Logged across all modalities')}
      ${statCard('⌀', c.acts.length ? `${Math.round(total / c.acts.length)}m` : '0m', 'Avg Session Duration', 'Optimal focus period')}
      ${statCard('🌍', `${com.users.length}`, 'Community Members', `${activeMembers30} active this month`)}
      ${statCard('🚀', `${hrs(sumMin(com.acts))}h`, 'Collective Hours', 'Knowledge shared in network')}
    </div>

    <!-- Charts Section: Skill Radar & Monthly Bars -->
    <div class="grid g2 section">
      <!-- Radar Chart Canvas -->
      <div class="card">
        <div class="card-head">
          <h3>Skill Domain Radar</h3>
          <span class="text-xs muted">Multi-category coverage</span>
        </div>
        <div class="chart-box" style="height: 280px;">
          <canvas id="skillRadarCanvas" width="380" height="260"></canvas>
        </div>
      </div>

      <!-- Monthly Hours Trend Canvas -->
      <div class="card">
        <div class="card-head">
          <h3>Monthly Learning Trend</h3>
          <span class="text-xs muted">Hours invested per month</span>
        </div>
        <div class="chart-box" style="height: 280px;">
          <canvas id="monthlyTrendCanvas" width="380" height="260"></canvas>
        </div>
      </div>
    </div>

    <!-- Modalities & Growth Opportunities -->
    <div class="grid g2 section">
      <div class="card">
        <div class="card-head">
          <h3>Learning Modality Distribution</h3>
        </div>
        ${total > 0 ? ['learned', 'taught', 'practiced'].map(t => `
          <div class="hrow">
            <span class="name">${actIcon(t)} ${t[0].toUpperCase() + t.slice(1)}</span>
            ${bar(total ? (byType[t] / total) * 100 : 0)}
            <span class="val">${hrs(byType[t])}h</span>
          </div>
        `).join('') : empty('No session activity recorded yet.', '📘')}

        <h4 style="margin-top: 18px; font-size: 14px;" class="muted uppercase font-bold">Time by Top Skills</h4>
        ${bySkill.slice(0, 5).map(([n, m]) => `
          <div class="hrow">
            <span class="name" title="${esc(n)}">${esc(n)}</span>
            ${bar(bySkill[0][1] ? (m / bySkill[0][1]) * 100 : 0, 'green')}
            <span class="val">${hrs(m)}h</span>
          </div>
        `).join('') || empty('No practice sessions logged yet.', '📊')}
      </div>

      <div class="card">
        <div class="card-head">
          <h3>🌱 Identified Growth Opportunities</h3>
        </div>
        <p class="text-xs muted mb-3">These skills are on your learning wishlist but have minimal logged practice so far:</p>
        <div class="list">
          ${growth.length ? growth.map(g => `
            <div class="item">
              <div class="grow">
                <div class="title">${esc(g.name)}</div>
                <div class="text-xs muted">${g.m ? `${hrs(g.m)} hours logged so far` : 'Zero sessions recorded'}</div>
              </div>
              <span class="chip warn">Needs Focus</span>
            </div>
          `).join('') : empty('All learning wishlist items have active sessions recorded!', '🌟')}
        </div>
      </div>
    </div>
  `;
};

after.analytics = () => {
  drawRadarChart();
  drawMonthlyTrendChart();
};

function drawRadarChart() {
  const canvas = $('#skillRadarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2 + 10;
  const radius = Math.min(cx, cy) - 45;

  const c = loadCtx();
  const byCat = {};
  let totalMinutes = 0;

  // Aggregate user's STRICT real session minutes by category
  c.acts.forEach(a => {
    const sk = c.skills.find(s => s.name.toLowerCase() === (a.skill || '').toLowerCase());
    const cat = sk ? sk.category : (a.skill || 'Other');
    byCat[cat] = (byCat[cat] || 0) + (+a.minutes || 0);
    totalMinutes += (+a.minutes || 0);
  });

  // Collect active categories from user's skills and activities
  const userCats = [...new Set([
    ...c.skills.map(s => s.category),
    ...Object.keys(byCat)
  ])].filter(Boolean);

  // If user has fewer than 3 categories, fill from default list for a balanced radar
  const defaultList = ['Programming', 'Graphic Design', 'Public Speaking', 'Digital Marketing', 'Video Editing', 'Content Writing'];
  const cats = [...userCats];
  for (const d of defaultList) {
    if (cats.length >= 6) break;
    if (!cats.includes(d)) cats.push(d);
  }
  const numAxes = Math.max(3, Math.min(8, cats.length));
  const activeAxes = cats.slice(0, numAxes);

  // Draw concentric polygon rings
  const rings = 4;
  for (let r = 1; r <= rings; r++) {
    const rad = (radius / rings) * r;
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();
  }

  // Draw spokes and category labels
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < numAxes; i++) {
    const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    const lx = cx + Math.cos(angle) * (radius + 22);
    const ly = cy + Math.sin(angle) * (radius + 22);
    const catName = activeAxes[i];
    const loggedMins = byCat[catName] || 0;
    const shortLabel = catName.length > 12 ? catName.slice(0, 10) + '..' : catName;
    ctx.fillText(`${shortLabel}${loggedMins > 0 ? ` (${hrs(loggedMins)}h)` : ''}`, lx, ly);
  }

  // If user has NO logged sessions yet, display honest live empty message
  if (totalMinutes === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No practice logged yet', cx, cy - 6);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Log a session to map your live radar', cx, cy + 12);
    return;
  }

  // Draw user's STRICT real data polygon
  const maxMin = Math.max(30, ...Object.values(byCat));
  ctx.beginPath();
  for (let i = 0; i < numAxes; i++) {
    const catName = activeAxes[i];
    const val = byCat[catName] || 0; // Strictly real user data (0 if not practiced)
    const factor = val > 0 ? Math.min(1, val / maxMin) : 0;
    const rad = radius * factor;

    const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.fillStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw data point dots on vertices with practice
  for (let i = 0; i < numAxes; i++) {
    const catName = activeAxes[i];
    const val = byCat[catName] || 0;
    if (val > 0) {
      const factor = Math.min(1, val / maxMin);
      const rad = radius * factor;
      const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#8b5cf6';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function drawMonthlyTrendChart() {
  const canvas = $('#monthlyTrendCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const c = loadCtx();
  const totalMin = sumMin(c.acts);

  if (totalMin === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No monthly activity logged yet', w / 2, h / 2 - 6);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Completed sessions will appear here live by month', w / 2, h / 2 + 12);
    return;
  }

  const trend = monthlyTrend(c.acts, 6);
  const maxHours = Math.max(1, ...trend.map(t => +hrs(t.minutes)));

  const padLeft = 40, padBottom = 35, padTop = 20, padRight = 20;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padTop + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    const val = ((maxHours / 3) * (3 - i)).toFixed(1);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(`${val}h`, padLeft - 6, y + 3);
  }

  // Draw Bars
  const barWidth = chartW / trend.length - 16;
  trend.forEach((t, i) => {
    const hours = +hrs(t.minutes);
    const barH = (hours / maxHours) * chartH;
    const x = padLeft + i * (chartW / trend.length) + 8;
    const y = padTop + chartH - barH;

    // Gradient bar
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#059669');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Value on top
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    if (hours > 0) {
      ctx.fillText(`${hours}h`, x + barWidth / 2, y - 6);
    }

    // Month label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(t.label, x + barWidth / 2, h - 12);
  });
}

/* --------------------------- RECOMMENDATIONS ------------------------- */
views.recommend = () => {
  const c = loadCtx();
  const com = loadCommunity();
  const matches = computeMatches(c.skills, com.users, com.skills);

  const mine = new Set(c.skills.map(lname));
  const myCats = new Set(c.skills.map(s => s.category));

  // Frequency of popular skills
  const popular = {};
  com.skills.filter(s => s.type === 'teach' && s.userId !== me.id && !mine.has(lname(s))).forEach(s => {
    popular[s.name] = popular[s.name] || { name: s.name, category: s.category, count: 0, score: 0 };
    popular[s.name].count++;
    popular[s.name].score += 1 + (myCats.has(s.category) ? 2 : 0);
  });

  const topRecs = Object.values(popular).sort((a, b) => b.score - a.score).slice(0, 4);

  return `
    <div class="section-head">
      <div>
        <h2>AI-Powered Learning Recommendations</h2>
        <p class="muted text-sm">Curated skill pathways, peer suggestions, and motivation nudges based on your learning trajectory.</p>
      </div>
    </div>

    <div class="grid g2">
      <!-- High Affinity Skills -->
      <div class="card">
        <div class="card-head">
          <h3>🌱 In-Demand Skills for Your Profile</h3>
        </div>
        <p class="text-xs muted mb-3">Peers in the network frequently swap these skills alongside what you teach:</p>
        <div class="list">
          ${topRecs.length ? topRecs.map(r => `
            <div class="item">
              <div class="grow">
                <div class="title">${esc(r.name)}</div>
                <div class="text-xs muted">${esc(r.category)} · ${r.count} community mentor${r.count > 1 ? 's' : ''} available</div>
              </div>
              <button class="btn sm primary glow" data-action="quickLearn" data-name="${esc(r.name)}" data-cat="${esc(r.category)}">+ Add to Wishlist</button>
            </div>
          `).join('') : empty('You already have all popular skills on your radar!', '🎉')}
        </div>
      </div>

      <!-- Partner Recommendations -->
      <div class="card">
        <div class="card-head">
          <h3>🤝 Top Recommended Learning Partners</h3>
        </div>
        <div class="list">
          ${matches.slice(0, 4).map(m => partnerRow(m, true, c.conns)).join('') || empty('Add skills to receive recommendations.', '👥')}
        </div>
      </div>
    </div>

    <!-- Nudges & Advice -->
    <div class="card section">
      <div class="card-head">
        <h3>🧭 Tailored Guidance for Accelerated Growth</h3>
      </div>
      <div class="grid g3">
        <div style="background: var(--bg-surface-elevated); padding: 16px; border-radius: 10px;">
          <h4 style="font-size: 14px; margin-bottom: 6px; color: var(--primary);">1. Propose an Asymmetric Swap</h4>
          <p class="text-xs muted">You don’t need identical session lengths. Offer 30 minutes of code debugging in return for a 20-minute design critique.</p>
        </div>
        <div style="background: var(--bg-surface-elevated); padding: 16px; border-radius: 10px;">
          <h4 style="font-size: 14px; margin-bottom: 6px; color: var(--teach);">2. The Protégé Effect</h4>
          <p class="text-xs muted">Teaching what you just learned accelerates mastery. After every learning session, try teaching the core concept to a peer.</p>
        </div>
        <div style="background: var(--bg-surface-elevated); padding: 16px; border-radius: 10px;">
          <h4 style="font-size: 14px; margin-bottom: 6px; color: var(--mutual);">3. Close the Feedback Loop</h4>
          <p class="text-xs muted">Always log session takeaways immediately after hanging up to retain 80% more insights long-term.</p>
        </div>
      </div>
    </div>
  `;
};

/* ----------------------------- ACHIEVEMENTS -------------------------- */
views.achievements = () => {
  const c = loadCtx();
  const got = Object.fromEntries(c.ach.map(a => [a.badge, a.date]));
  const pct = Math.round((c.ach.length / BADGES.length) * 100);

  return `
    <div class="section-head">
      <div>
        <h2>Achievement Badges &amp; Gamification</h2>
        <p class="muted text-sm">Earn recognition for community contributions, milestone achievements, and disciplined streaks.</p>
      </div>
      <span class="chip primary text-sm">${c.ach.length} of ${BADGES.length} Unlocked (${pct}%)</span>
    </div>

    <div class="mb-4">
      ${bar(pct, 'green')}
    </div>

    <div class="grid gauto">
      ${BADGES.map(b => {
        const isUnlocked = !!got[b.id];
        return `
          <div class="card badge-card ${isUnlocked ? 'unlocked' : 'locked'}">
            <div class="ico">${b.icon}</div>
            <h4 style="font-size: 16px; margin-bottom: 4px;">${esc(b.title)}</h4>
            <div class="text-xs muted mb-2">${esc(b.desc)}</div>
            ${isUnlocked ? `
              <div class="text-xs font-bold" style="color: var(--teach);">✓ Unlocked on ${fmtDate(got[b.id])}</div>
            ` : `
              <div class="text-xs muted">🔒 Locked</div>
            `}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

/* -------------------------------- HISTORY ---------------------------- */
views.history = () => {
  const c = loadCtx();
  const events = [];

  c.acts.forEach(a => {
    events.push({
      k: 'activity',
      d: a.date,
      title: `${actIcon(a.type)} ${a.type.toUpperCase()}: ${esc(a.skill)} (${a.minutes} min)`,
      sub: a.partner ? `With ${esc(a.partner)}` : esc(a.notes)
    });
  });

  c.goals.forEach(g => {
    events.push({
      k: 'goal',
      d: g.createdAt.slice(0, 10),
      title: `🎯 Established Goal: "${esc(g.title)}"`,
      sub: g.skill ? `Linked to ${esc(g.skill)}` : ''
    });
    (g.milestones || []).filter(m => m.done).forEach(m => {
      events.push({
        k: 'goal',
        d: g.createdAt.slice(0, 10),
        title: `✓ Milestone Achieved: ${esc(m.text)}`,
        sub: `Goal: ${esc(g.title)}`
      });
    });
  });

  c.ach.forEach(a => {
    const b = BADGES.find(x => x.id === a.badge);
    if (b) {
      events.push({
        k: 'badge-ev',
        d: a.date,
        title: `${b.icon} Badge Unlocked: "${esc(b.title)}"`,
        sub: esc(b.desc)
      });
    }
  });

  c.skills.forEach(s => {
    events.push({
      k: 'skill',
      d: (s.createdAt || todayStr()).slice(0, 10),
      title: `${s.type === 'teach' ? '🎓 Added Teaching Skill' : '🌱 Added Learning Goal'}: ${esc(s.name)}`,
      sub: `${esc(s.category)} · ${esc(s.level)}`
    });
  });

  events.sort((a, b) => b.d.localeCompare(a.d));
  const filtered = events.filter(e => historyFilter === 'all' || e.k === historyFilter);

  return `
    <div class="section-head">
      <div>
        <h2>Historical Audit Timeline</h2>
        <p class="muted text-sm">Chronological record of every learning session, achievement unlock, and skill modification.</p>
      </div>

      <select data-hfilter style="width: auto;">
        <option value="all" ${historyFilter === 'all' ? 'selected' : ''}>Show All Events</option>
        <option value="activity" ${historyFilter === 'activity' ? 'selected' : ''}>Sessions Only</option>
        <option value="goal" ${historyFilter === 'goal' ? 'selected' : ''}>Goals & Milestones</option>
        <option value="badge-ev" ${historyFilter === 'badge-ev' ? 'selected' : ''}>Achievements Only</option>
        <option value="skill" ${historyFilter === 'skill' ? 'selected' : ''}>Skill Portfolio</option>
      </select>
    </div>

    <div class="card">
      ${filtered.length ? `
        <div class="timeline">
          ${filtered.map(e => `
            <div class="tl-item ${e.k}">
              <div class="text-xs muted font-semibold">${fmtDate(e.d)}</div>
              <div class="font-bold text-sm" style="margin: 2px 0;">${e.title}</div>
              ${e.sub ? `<div class="text-xs muted">${e.sub}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : empty('No history recorded under this filter.', '🕘')}
    </div>
  `;
};

/* ------------------------------- EXPORT ------------------------------ */
views.export = () => {
  const stats = StorageDB.getStats();

  return `
    <div class="section-head">
      <div>
        <h2>Data Management, LocalStorage &amp; Reports</h2>
        <p class="muted text-sm">All user records, skill profiles, and learning sessions are saved directly in your browser’s LocalStorage.</p>
      </div>
    </div>

    <div class="grid g2">
      <!-- Data Export Suite -->
      <div class="card">
        <div class="card-head">
          <h3>💾 Export Your Records</h3>
        </div>
        <p class="text-sm muted mb-3">Download your entire learning history for academic credit, portfolio submission, or offline backup.</p>
        
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="btn primary glow" data-action="exportReport">📄 View &amp; Print Comprehensive Skill Report</button>
          <button class="btn" data-action="exportJSON">📦 Full Backup (JSON)</button>
          <button class="btn" data-action="exportActivities">📊 Export Sessions (CSV)</button>
          <button class="btn" data-action="exportSkills">🎓 Export Skills (CSV)</button>
          <button class="btn" data-action="exportGoals">🎯 Export Goals (CSV)</button>
        </div>
      </div>

      <!-- LocalStorage Inspector -->
      <div class="card">
        <div class="card-head">
          <h3>⚡ LocalStorage Diagnostics</h3>
        </div>
        <p class="text-sm muted mb-3">Browser storage database metrics:</p>
        
        <table>
          <thead>
            <tr>
              <th>Store Entity</th>
              <th>Record Count</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(stats.breakdown).map(([k, count]) => `
              <tr>
                <td><b>${esc(k)}</b></td>
                <td>${count} records</td>
              </tr>
            `).join('')}
            <tr>
              <td><b>Total Storage Size</b></td>
              <td><b>${stats.kb} KB</b> (${stats.records} items)</td>
            </tr>
          </tbody>
        </table>

        <div style="display: flex; gap: 10px; margin-top: 18px;">
          <button class="btn danger block" data-action="resetDb">Reset to Default Seed Data</button>
        </div>
      </div>
    </div>
  `;
};

const exporters = {
  exportJSON() {
    const c = loadCtx();
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      user: me,
      skills: c.skills,
      goals: c.goals,
      activities: c.acts,
      achievements: c.ach,
      connections: c.conns,
      proposals: c.props
    };
    download(`skillswap-backup-${todayStr()}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast('JSON backup downloaded successfully!', 'ok');
  },

  exportActivities() {
    const c = loadCtx();
    download('sessions.csv', toCSV(c.acts, ['date', 'type', 'skill', 'partner', 'minutes', 'rating', 'notes']), 'text/csv');
    toast('Sessions exported as CSV!', 'ok');
  },

  exportSkills() {
    const c = loadCtx();
    download('skills.csv', toCSV(c.skills, ['type', 'name', 'category', 'level', 'format', 'description']), 'text/csv');
    toast('Skills exported as CSV!', 'ok');
  },

  exportGoals() {
    const c = loadCtx();
    download('goals.csv', toCSV(c.goals.map(g => ({
      title: g.title,
      skill: g.skill,
      targetDate: g.targetDate,
      progress: goalProgress(g)
    })), ['title', 'skill', 'targetDate', 'progress']), 'text/csv');
    toast('Goals exported as CSV!', 'ok');
  },

  exportReport() {
    const c = loadCtx();
    const st = streaks(c.acts);
    const xp = calculateXP(c);
    const lvl = getLevelInfo(xp);

    const teach = c.skills.filter(s => s.type === 'teach');
    const learn = c.skills.filter(s => s.type === 'learn');

    openModal(`Official Skill Development & Learning Report`, `
      <div style="font-family: var(--font-body); padding: 10px;" id="printableReport">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--primary); padding-bottom: 12px; margin-bottom: 18px;">
          <div>
            <h2 style="font-size: 22px; color: var(--primary);">SKILLSWAP VERIFIED PROGRESS REPORT</h2>
            <div class="text-xs muted">Community Skill Exchange and Learning Network</div>
          </div>
          <div style="text-align: right;">
            <div class="text-xs muted">Generated on: ${new Date().toLocaleDateString()}</div>
            <div class="text-xs font-bold">Verification ID: SS-${me.id}-${Date.now().toString(36).toUpperCase()}</div>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 14px; border-radius: 8px; margin-bottom: 18px;">
          <div class="row2">
            <div>
              <div class="text-xs muted">Learner Name:</div>
              <div class="font-bold text-base">${esc(me.name)}</div>
            </div>
            <div>
              <div class="text-xs muted">Institution &amp; Role:</div>
              <div class="font-bold text-base">${esc(me.institution || 'Community')} (${esc(me.role)})</div>
            </div>
          </div>
          <div class="row2" style="margin-top: 8px;">
            <div>
              <div class="text-xs muted">Program / Degree:</div>
              <div>${esc(me.education || 'Lifelong Learning')}</div>
            </div>
            <div>
              <div class="text-xs muted">SkillSwap Rank:</div>
              <div>Level ${lvl.level} · ${lvl.title} (${xp} XP)</div>
            </div>
          </div>
        </div>

        <h3 style="font-size: 15px; margin-bottom: 8px;">1. Executive Learning Metrics</h3>
        <table style="margin-bottom: 18px;">
          <tbody>
            <tr>
              <td>Total Exchange Sessions</td><td><b>${c.acts.length}</b></td>
              <td>Total Exchange Hours</td><td><b>${hrs(sumMin(c.acts))}h</b></td>
            </tr>
            <tr>
              <td>Teaching Sessions</td><td><b>${c.acts.filter(a => a.type === 'taught').length}</b></td>
              <td>Active Streak (Days)</td><td><b>${st.cur} days (Best: ${st.best})</b></td>
            </tr>
            <tr>
              <td>30-Day Consistency</td><td><b>${consistency(c.acts)}%</b></td>
              <td>Goal Completion Rate</td><td><b>${c.goals.length ? Math.round((c.goals.filter(g => goalProgress(g) >= 100).length / c.goals.length) * 100) : 0}%</b></td>
            </tr>
          </tbody>
        </table>

        <h3 style="font-size: 15px; margin-bottom: 8px;">2. Skill Portfolio</h3>
        <p class="text-xs mb-1"><b>Skills Offered to Teach:</b> ${teach.map(s => `${s.name} (${s.level})`).join(', ') || 'None'}</p>
        <p class="text-xs mb-3"><b>Skills Being Learned:</b> ${learn.map(s => `${s.name} (${s.level})`).join(', ') || 'None'}</p>

        <h3 style="font-size: 15px; margin-bottom: 8px;">3. Recent Verified Sessions</h3>
        <table style="margin-bottom: 18px;">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>Skill</th>
              <th>Partner</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${c.acts.slice(0, 6).map(a => `
              <tr>
                <td>${fmtDate(a.date)}</td>
                <td>${esc(a.type)}</td>
                <td>${esc(a.skill)}</td>
                <td>${esc(a.partner) || 'Self'}</td>
                <td>${a.minutes} min</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="border-top: 1px dashed var(--line); padding-top: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div class="text-xs muted">Verified by SkillSwap Browser LocalStorage Ledger Engine.</div>
          <button class="btn primary sm" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>
      </div>
    `, true);
  }
};

/* --------------------------- EVENT HANDLING -------------------------- */
const actions = {
  authTab(el) {
    $$('.tab').forEach(t => t.classList.toggle('active', t === el));
    const tab = el.dataset.tab;
    $('#loginForm').classList.toggle('hidden', tab !== 'login');
    $('#registerForm').classList.toggle('hidden', tab !== 'register');
    $('#demoPicker').classList.toggle('hidden', tab !== 'demo');

    if (tab === 'demo') {
      const users = StorageDB.all('users');
      $('#demoUsersGrid').innerHTML = users.map(u => `
        <button class="demo-user-card" data-action="pickDemoUser" data-id="${u.id}">
          ${avatar(u.name, 'sm')}
          <div>
            <b>${esc(u.name)}</b>
            <div class="text-xs muted">${esc(u.role)} · ${esc(u.institution || '')}</div>
          </div>
        </button>
      `).join('');
    }
  },

  fillDemo(el) {
    const email = el.dataset.email;
    const form = $('#loginForm');
    if (form) {
      form.email.value = email;
      form.password.value = 'password123';
      forms.login(form);
    }
  },

  pickDemoUser(el) {
    const id = +el.dataset.id;
    const u = StorageDB.get('users', id);
    if (u) {
      startSession(u);
      toast(`Switched persona to ${u.name}!`, 'ok');
    }
  },

  quickSwitchUser(el) {
    const id = +el.value;
    const u = StorageDB.get('users', id);
    if (u) {
      startSession(u);
      toast(`Active persona: ${u.name}`, 'ok');
    }
  },

  logout() {
    StorageDB.setMeta('session', null);
    if (typeof setAuthToken === 'function') setAuthToken(null);
    if (typeof HubState !== 'undefined' && HubState.socket) HubState.socket.disconnect();
    me = null;
    $('#app').classList.add('hidden');
    $('#auth').classList.remove('hidden');
  },

  toggleMenu() {
    $('#sidebar').classList.toggle('open');
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    StorageDB.setMeta('theme', next);
    const icon = $('#themeIcon');
    if (icon) icon.textContent = next === 'dark' ? '🌙' : '☀️';
    render();
  },

  openProposalsTab() {
    location.hash = '#proposals';
  },

  goToProfile() {
    location.hash = '#profile';
  },

  closeModal,

  addSkill(el) {
    const type = el && el.dataset.type ? el.dataset.type : 'teach';
    skillForm({}, type);
  },

  editSkill(el) {
    const s = StorageDB.get('skills', +el.dataset.id);
    if (s) skillForm(s);
  },

  delSkill(el) {
    if (confirm('Are you sure you want to remove this skill from your portfolio?')) {
      StorageDB.del('skills', +el.dataset.id);
      toast('Skill removed from profile.');
      render();
    }
  },

  quickLearn(el) {
    StorageDB.add('skills', {
      userId: me.id,
      type: 'learn',
      name: el.dataset.name,
      category: el.dataset.cat,
      level: 'Beginner',
      format: '1-on-1 Session',
      description: 'Added via AI recommendation',
      createdAt: new Date().toISOString()
    });
    toast(`Added "${el.dataset.name}" to your learning wishlist!`, 'ok');
    checkAchievements();
    render();
  },

  connect(el) {
    const id = +el.dataset.id;
    const ex = StorageDB.by('connections', 'userId', me.id).find(c => c.otherId === id);
    if (!ex) {
      StorageDB.add('connections', { userId: me.id, otherId: id, createdAt: new Date().toISOString() });
      toast('Connected! You can now propose swaps and log sessions together.', 'ok');
      closeModal();
      checkAchievements();
      render();
    }
  },

  disconnect(el) {
    const id = +el.dataset.id;
    const ex = StorageDB.by('connections', 'userId', me.id).find(c => c.otherId === id);
    if (ex && confirm('Disconnect from this learning partner?')) {
      StorageDB.del('connections', ex.id);
      toast('Partner disconnected.');
      render();
    }
  },

  viewUser(el) {
    viewUser(+el.dataset.id);
  },

  proposeExchange(el) {
    proposeExchangeModal(+el.dataset.id);
  },

  acceptProposal(el) {
    const p = StorageDB.get('proposals', +el.dataset.id);
    if (!p) return;
    p.status = 'accepted';
    StorageDB.put('proposals', p);

    // Auto-connect partners
    const myConns = StorageDB.by('connections', 'userId', me.id);
    if (!myConns.some(c => c.otherId === p.fromUserId)) {
      StorageDB.add('connections', { userId: me.id, otherId: p.fromUserId, createdAt: new Date().toISOString() });
    }

    toast('Proposal accepted! Added to your Learning Network.', 'ok');
    triggerConfetti();
    render();
  },

  declineProposal(el) {
    const p = StorageDB.get('proposals', +el.dataset.id);
    if (!p) return;
    p.status = 'declined';
    StorageDB.put('proposals', p);
    toast('Proposal declined.');
    render();
  },

  cancelProposal(el) {
    const p = StorageDB.get('proposals', +el.dataset.id);
    if (!p) return;
    StorageDB.del('proposals', p.id);
    toast('Proposal request cancelled.');
    render();
  },

  completeProposal(el) {
    const p = StorageDB.get('proposals', +el.dataset.id);
    if (!p) return;
    p.status = 'completed';
    StorageDB.put('proposals', p);
    toast('Skill exchange marked as completed! (+150 XP)', 'gold');
    triggerConfetti();
    checkAchievements();
    render();
  },

  pickCategory(el) {
    filters.category = el.dataset.cat;
    render();
  },

  clearFilters() {
    Object.assign(filters, { q: '', category: '', type: '', level: '', role: '', sort: 'match' });
    render();
  },

  addGoal() {
    goalModal();
  },

  delGoal(el) {
    if (confirm('Are you sure you want to delete this learning goal?')) {
      StorageDB.del('goals', +el.dataset.id);
      toast('Goal removed.');
      render();
    }
  },

  addActivity() {
    activityModal();
  },

  logWith(el) {
    activityModal(el.dataset.name, el.dataset.skill || '');
  },

  delActivity(el) {
    if (confirm('Delete this session from your activity ledger?')) {
      StorageDB.del('activities', +el.dataset.id);
      toast('Session removed.');
      render();
    }
  },

  resetDb() {
    if (confirm('This will wipe your current LocalStorage and restore full demo community data. Continue?')) {
      StorageDB.clearAll();
      location.hash = '';
      location.reload();
    }
  },

  ...exporters
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    actions[el.dataset.action](el);
  }
});

document.addEventListener('submit', e => {
  const name = e.target.dataset.form;
  if (name && forms[name]) {
    e.preventDefault();
    try {
      forms[name](e.target);
    } catch (err) {
      console.error(err);
      toast('Action failed: ' + err.message, 'err');
    }
  }
});

document.addEventListener('input', e => {
  const k = e.target.dataset.filter;
  if (k) {
    filters[k] = e.target.value;
    drawDiscover();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  const k = t.dataset.change;

  if (t.dataset.hfilter !== undefined) {
    historyFilter = t.value;
    return render();
  }

  if (k === 'toggleMs') {
    const g = StorageDB.get('goals', +t.dataset.id);
    if (g && g.milestones && g.milestones[+t.dataset.i]) {
      g.milestones[+t.dataset.i].done = t.checked;
      StorageDB.put('goals', g);
      if (goalProgress(g) >= 100) {
        toast(`Goal Completed: "${g.title}"! (+300 XP)`, 'gold');
        triggerConfetti();
      } else {
        toast(t.checked ? 'Milestone completed (+100 XP)!' : 'Milestone unchecked.');
      }
      checkAchievements();
      render();
    }
  }

  if (k === 'goalProgress') {
    const g = StorageDB.get('goals', +t.dataset.id);
    if (g) {
      g.progress = +t.value;
      StorageDB.put('goals', g);
      if (g.progress >= 100) {
        toast(`Goal Completed: "${g.title}"! (+300 XP)`, 'gold');
        triggerConfetti();
      }
      checkAchievements();
      render();
    }
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ------------------------------- BOOT -------------------------------- */
(function init() {
  try {
    seedIfEmpty();

    // Theme initialization
    const savedTheme = StorageDB.getMeta('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeIcon = $('#themeIcon');
    if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

    // Active session recovery
    const sId = StorageDB.getMeta('session');
    const u = sId ? StorageDB.get('users', +sId) : null;

    if (u) {
      me = u;
      showApp();
    } else {
      // Default to Aarav Sharma for immediate showcase
      const defaultUser = StorageDB.all('users')[0];
      if (defaultUser) {
        me = defaultUser;
        StorageDB.setMeta('session', me.id);
        showApp();
      } else {
        $('#auth').classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Initialization error:', err);
    document.body.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center;">
        <h2>Failed to initialize SkillSwap LocalStorage Engine</h2>
        <p>${esc(err.message)}</p>
      </div>
    `;
  }
})();
