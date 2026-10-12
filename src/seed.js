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
} = require('./models');
const { hashPassword } = require('./auth');

const demoSkillsData = {
  'aarav@demo.com': {
    skillsOffered: [
      { name: 'Web Development', category: 'Programming', level: 'Advanced', description: 'Full-stack React, Node.js, and modern CSS/TypeScript architectures.', format: '1-on-1 Session' },
      { name: 'Python', category: 'Programming', level: 'Intermediate', description: 'Automation scripts, backend APIs, and web scraping pipelines.', format: 'Code Review' }
    ],
    skillsWanted: [
      { name: 'UI/UX', category: 'Design', level: 'Beginner', description: 'Figma auto-layout, design tokens, and user research.' },
      { name: 'Public Speaking', category: 'Communication', level: 'Beginner', description: 'Technical presentations, pitch structures, and stage confidence.' }
    ],
    availability: ['Weekday Evenings', 'Weekends'],
    preferredMethods: ['1-on-1 Session', 'Project Review']
  },
  'meera@demo.com': {
    skillsOffered: [
      { name: 'UI/UX', category: 'Design', level: 'Expert', description: 'Design systems, prototyping in Figma, and heuristic evaluations.', format: '1-on-1 Session' },
      { name: 'Typography', category: 'Design', level: 'Advanced', description: 'Editorial styling, hierarchy, and responsive font scales.', format: 'Design Critique' }
    ],
    skillsWanted: [
      { name: 'Web Development', category: 'Programming', level: 'Beginner', description: 'Interactive frontend coding, HTML/CSS and React fundamentals.' }
    ],
    availability: ['Weekday Evenings', 'Weekends'],
    preferredMethods: ['1-on-1 Session', 'Pair Programming']
  },
  'rohan@demo.com': {
    skillsOffered: [
      { name: 'Public Speaking', category: 'Communication', level: 'Expert', description: 'Keynote delivery, pitch decks, and vocal presence.', format: '1-on-1 Session' },
      { name: 'Communication', category: 'Soft Skills', level: 'Expert', description: 'Stakeholder communication and leadership dialogue.', format: 'Workshop' }
    ],
    skillsWanted: [
      { name: 'Python', category: 'Programming', level: 'Beginner', description: 'Data analysis and marketing automation.' }
    ],
    availability: ['Weekday Mornings', 'Weekends'],
    preferredMethods: ['1-on-1 Session']
  },
  'priya@demo.com': {
    skillsOffered: [
      { name: 'Content Writing', category: 'Writing', level: 'Expert', description: 'Technical documentation, copywriting, and narrative essays.', format: '1-on-1 Session' },
      { name: 'Storytelling', category: 'Writing', level: 'Advanced', description: 'Brand voice and editorial development.', format: 'Draft Feedback' }
    ],
    skillsWanted: [
      { name: 'Web Development', category: 'Programming', level: 'Beginner', description: 'Portfolio website development with modern CSS.' }
    ],
    availability: ['Weekday Evenings'],
    preferredMethods: ['1-on-1 Session']
  },
  'vikram@demo.com': {
    skillsOffered: [
      { name: 'Java', category: 'Programming', level: 'Expert', description: 'Spring Boot, distributed systems, and JVM optimization.', format: '1-on-1 Session' },
      { name: 'Cloud Architecture', category: 'DevOps', level: 'Advanced', description: 'Kubernetes, Docker, and scalable microservices.', format: 'System Design Review' }
    ],
    skillsWanted: [
      { name: 'AI/ML', category: 'Artificial Intelligence', level: 'Beginner', description: 'Machine learning fundamentals and model inference pipelines.' }
    ],
    availability: ['Weekends'],
    preferredMethods: ['1-on-1 Session']
  },
  'ananya@demo.com': {
    skillsOffered: [
      { name: 'AI/ML', category: 'Artificial Intelligence', level: 'Advanced', description: 'PyTorch deep learning, computer vision, and neural networks.', format: '1-on-1 Session' },
      { name: 'Python', category: 'Programming', level: 'Advanced', description: 'Data science with NumPy, Pandas, and Scikit-learn.', format: 'Notebook Review' }
    ],
    skillsWanted: [
      { name: 'Java', category: 'Programming', level: 'Intermediate', description: 'Enterprise backend services and high-throughput systems.' }
    ],
    availability: ['Weekday Evenings', 'Weekends'],
    preferredMethods: ['1-on-1 Session']
  }
};

async function ensureUserSkillsAndArtifacts() {
  const users = await User.find();
  const userMap = {};
  for (const u of users) {
    userMap[u.email] = u;
    const demoSkills = demoSkillsData[u.email];
    if (demoSkills && (!u.skillsOffered || u.skillsOffered.length === 0)) {
      u.skillsOffered = demoSkills.skillsOffered;
      u.skillsWanted = demoSkills.skillsWanted;
      u.availability = demoSkills.availability;
      u.preferredMethods = demoSkills.preferredMethods;
      await u.save();
    }
  }

  const aarav = userMap['aarav@demo.com'];
  const meera = userMap['meera@demo.com'];
  const rohan = userMap['rohan@demo.com'];

  // Seed sample goals if none exist
  if (aarav) {
    const goalCount = await Goal.countDocuments({ userId: aarav._id });
    if (goalCount === 0) {
      await Goal.create([
        {
          userId: aarav._id,
          title: 'Master Figma Auto-Layout & Design Tokens',
          skill: 'UI/UX',
          targetDate: new Date(Date.now() + 30 * 86400000),
          progress: 65,
          milestones: [
            { text: 'Complete wireframing component basics', done: true },
            { text: 'Build responsive auto-layout card system', done: true },
            { text: 'Export production CSS tokens', done: false }
          ]
        },
        {
          userId: aarav._id,
          title: 'Deliver Technical Conference Lightning Talk',
          skill: 'Public Speaking',
          targetDate: new Date(Date.now() + 60 * 86400000),
          progress: 40,
          milestones: [
            { text: 'Draft 5-minute problem/solution outline', done: true },
            { text: 'Rehearse with peer feedback from Rohan', done: false }
          ]
        }
      ]);
    }

    const activityCount = await Activity.countDocuments({ userId: aarav._id });
    if (activityCount === 0) {
      await Activity.create([
        {
          userId: aarav._id,
          type: 'taught',
          skill: 'Web Development',
          partner: meera ? meera.name : 'Meera Iyer',
          partnerId: meera ? meera._id : null,
          minutes: 60,
          date: new Date(Date.now() - 5 * 86400000),
          rating: 5,
          notes: 'Covered modern JavaScript event loops and reactive state binding.'
        },
        {
          userId: aarav._id,
          type: 'learned',
          skill: 'UI/UX',
          partner: meera ? meera.name : 'Meera Iyer',
          partnerId: meera ? meera._id : null,
          minutes: 60,
          date: new Date(Date.now() - 3 * 86400000),
          rating: 5,
          notes: 'Deep-dive session into Figma auto-layout and component design tokens.'
        },
        {
          userId: aarav._id,
          type: 'learned',
          skill: 'Communication',
          partner: rohan ? rohan.name : 'Rohan Das',
          partnerId: rohan ? rohan._id : null,
          minutes: 45,
          date: new Date(Date.now() - 2 * 86400000),
          rating: 5,
          notes: 'Rehearsed technical pitch structure and executive presence.'
        }
      ]);
    }

    // Seed sample conversation between Aarav & Meera
    if (meera) {
      let conv = await Conversation.findOne({
        participants: { $all: [aarav._id, meera._id] }
      });
      if (!conv) {
        conv = await Conversation.create({
          participants: [aarav._id, meera._id],
          lastMessage: 'Sounds great! I uploaded the Figma design tokens in our hub post.',
          lastMessageSenderId: meera._id,
          lastMessageAt: new Date(Date.now() - 3600000)
        });

        await Message.create([
          {
            conversationId: conv._id,
            senderId: aarav._id,
            recipientId: meera._id,
            text: 'Hey Meera! Thanks for the wonderful UI/UX session earlier.',
            isRead: true,
            createdAt: new Date(Date.now() - 7200000)
          },
          {
            conversationId: conv._id,
            senderId: meera._id,
            recipientId: aarav._id,
            text: 'Sounds great! I uploaded the Figma design tokens in our hub post.',
            isRead: true,
            createdAt: new Date(Date.now() - 3600000)
          }
        ]);
      }
    }

    // Seed sample notifications
    const notifCount = await Notification.countDocuments({ userId: aarav._id });
    if (notifCount === 0) {
      await Notification.create([
        {
          userId: aarav._id,
          senderId: meera ? meera._id : null,
          type: 'endorsement',
          title: 'New Skill Endorsement',
          message: 'Meera Iyer endorsed your Web Development skill.',
          link: '#trust'
        },
        {
          userId: aarav._id,
          senderId: rohan ? rohan._id : null,
          type: 'session_completed',
          title: 'Session Completed',
          message: 'Your Communication coaching session with Rohan Das was marked completed.',
          link: '#trust'
        }
      ]);
    }
  }
}

async function seedDatabase() {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    console.log(`[Seed] Database already has ${userCount} users. Ensuring skills and artifacts are up to date...`);
    await ensureUserSkillsAndArtifacts();
    return;
  }

  console.log('[Seed] Seeding initial database records for SkillSwap...');

  const defaultPasswordHash = await hashPassword('password123');

  // 1. Create Users
  const usersData = [
    {
      name: 'Aarav Sharma',
      email: 'aarav@demo.com',
      password: defaultPasswordHash,
      systemRole: 'member',
      role: 'Student',
      institution: 'IIT Madras',
      education: 'B.Tech Computer Science & Engineering',
      location: 'Chennai, India',
      bio: 'Full-stack builder passionate about open source, modern web architectures, and AI tooling.',
      interests: 'React, Node.js, Web Development, Python, AI/ML, System Design',
      skillsOffered: demoSkillsData['aarav@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['aarav@demo.com'].skillsWanted,
      availability: demoSkillsData['aarav@demo.com'].availability,
      preferredMethods: demoSkillsData['aarav@demo.com'].preferredMethods,
      legacyId: 1
    },
    {
      name: 'Meera Iyer',
      email: 'meera@demo.com',
      password: defaultPasswordHash,
      systemRole: 'moderator',
      role: 'Student',
      institution: 'National Institute of Design',
      education: 'M.Des Interaction & Visual Communication',
      location: 'Ahmedabad, India',
      bio: 'UI/UX and brand designer with 4 years craft. Passionate about human-centric interfaces and design tokens.',
      interests: 'Figma, Design Systems, Typography, UI/UX, Creative Coding',
      skillsOffered: demoSkillsData['meera@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['meera@demo.com'].skillsWanted,
      availability: demoSkillsData['meera@demo.com'].availability,
      preferredMethods: demoSkillsData['meera@demo.com'].preferredMethods,
      legacyId: 2
    },
    {
      name: 'Rohan Das',
      email: 'rohan@demo.com',
      password: defaultPasswordHash,
      systemRole: 'admin',
      role: 'Professional',
      institution: 'BrightWave Growth Labs',
      education: 'MBA Strategic Marketing & Analytics',
      location: 'Bengaluru, India',
      bio: 'Senior Growth Strategist & Public Speaker. Scaled SaaS products from 0 to 1M users.',
      interests: 'Public Speaking, Communication, Python Automation, Storytelling',
      skillsOffered: demoSkillsData['rohan@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['rohan@demo.com'].skillsWanted,
      availability: demoSkillsData['rohan@demo.com'].availability,
      preferredMethods: demoSkillsData['rohan@demo.com'].preferredMethods,
      legacyId: 3
    },
    {
      name: 'Priya Nair',
      email: 'priya@demo.com',
      password: defaultPasswordHash,
      systemRole: 'member',
      role: 'Professional',
      institution: 'The Narrative Guild',
      education: 'M.A. Journalism & Media Studies',
      location: 'Mumbai, India',
      bio: 'Investigative writer, corporate storyteller, and creative communications lead.',
      interests: 'Communication, Content Writing, Storytelling, Brand Strategy',
      skillsOffered: demoSkillsData['priya@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['priya@demo.com'].skillsWanted,
      availability: demoSkillsData['priya@demo.com'].availability,
      preferredMethods: demoSkillsData['priya@demo.com'].preferredMethods,
      legacyId: 4
    },
    {
      name: 'Vikram Malhotra',
      email: 'vikram@demo.com',
      password: defaultPasswordHash,
      systemRole: 'member',
      role: 'Professional',
      institution: 'CloudScale Systems',
      education: 'M.S. Distributed Computing',
      location: 'Hyderabad, India',
      bio: 'Backend systems engineer specializing in Java, microservices, and distributed streaming.',
      interests: 'Java, Spring Boot, Microservices, Cloud Architecture',
      skillsOffered: demoSkillsData['vikram@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['vikram@demo.com'].skillsWanted,
      availability: demoSkillsData['vikram@demo.com'].availability,
      preferredMethods: demoSkillsData['vikram@demo.com'].preferredMethods,
      legacyId: 5
    },
    {
      name: 'Ananya Patel',
      email: 'ananya@demo.com',
      password: defaultPasswordHash,
      systemRole: 'member',
      role: 'Student',
      institution: 'BITS Pilani',
      education: 'B.E. Electronics & AI',
      location: 'Goa, India',
      bio: 'Machine learning researcher working on multi-modal vision-language models and PyTorch.',
      interests: 'AI/ML, Python, PyTorch, Deep Learning, Computer Vision',
      skillsOffered: demoSkillsData['ananya@demo.com'].skillsOffered,
      skillsWanted: demoSkillsData['ananya@demo.com'].skillsWanted,
      availability: demoSkillsData['ananya@demo.com'].availability,
      preferredMethods: demoSkillsData['ananya@demo.com'].preferredMethods,
      legacyId: 6
    }
  ];

  const createdUsers = await User.insertMany(usersData);
  const userMap = {};
  createdUsers.forEach(u => {
    userMap[u.email] = u;
  });

  const aarav = userMap['aarav@demo.com'];
  const meera = userMap['meera@demo.com'];
  const rohan = userMap['rohan@demo.com'];
  const vikram = userMap['vikram@demo.com'];
  const ananya = userMap['ananya@demo.com'];

  // 2. Create Completed Learning Sessions (to enable reviews and trust score)
  const session1 = await LearningSession.create({
    mentorId: aarav._id,
    learnerId: meera._id,
    skill: 'Web Development',
    category: 'Programming',
    minutes: 60,
    date: new Date(Date.now() - 5 * 86400000),
    notes: 'Covered modern JavaScript event loops, DOM performance, and state binding for design portfolios.',
    status: 'completed'
  });

  const session2 = await LearningSession.create({
    mentorId: meera._id,
    learnerId: aarav._id,
    skill: 'UI/UX',
    category: 'Graphic Design',
    minutes: 60,
    date: new Date(Date.now() - 3 * 86400000),
    notes: 'Deep-dive session into Figma auto-layout, wireframing rules, and design tokens.',
    status: 'completed'
  });

  const session3 = await LearningSession.create({
    mentorId: rohan._id,
    learnerId: aarav._id,
    skill: 'Communication',
    category: 'Public Speaking',
    minutes: 45,
    date: new Date(Date.now() - 2 * 86400000),
    notes: 'Rehearsed technical hackathon presentation with strong problem-solution hook and vocal pacing.',
    status: 'completed'
  });

  const session4 = await LearningSession.create({
    mentorId: vikram._id,
    learnerId: ananya._id,
    skill: 'Java',
    category: 'Programming',
    minutes: 75,
    date: new Date(Date.now() - 4 * 86400000),
    notes: 'Concurrent data structures and performance profiling in Java 21.',
    status: 'completed'
  });

  // 3. Create Valid Reviews for completed sessions
  await Review.create({
    sessionId: session1._id,
    reviewerId: meera._id,
    revieweeId: aarav._id,
    rating: 5,
    skill: 'Web Development',
    comment: 'Aarav is an exceptional mentor! He explained async JavaScript and component architecture clearly with live examples.'
  });

  await Review.create({
    sessionId: session2._id,
    reviewerId: aarav._id,
    revieweeId: meera._id,
    rating: 5,
    skill: 'UI/UX',
    comment: 'Meera transformed how I look at design systems. Her guidance on spacing scales and auto-layout was eye-opening!'
  });

  await Review.create({
    sessionId: session3._id,
    reviewerId: aarav._id,
    revieweeId: rohan._id,
    rating: 5,
    skill: 'Communication',
    comment: 'Rohan gave actionable, high-impact feedback on pitch structure and executive presence. Highly recommended!'
  });

  // 4. Create Peer Endorsements
  await Endorsement.create([
    {
      endorserId: meera._id,
      recipientId: aarav._id,
      skill: 'Web Development',
      comment: 'Demonstrated outstanding expertise in modern JavaScript and reactive UI architectures during our peer build sessions.',
      evidenceUrl: 'https://github.com/aarav-sharma'
    },
    {
      endorserId: rohan._id,
      recipientId: aarav._id,
      skill: 'Python',
      comment: 'Aarav wrote robust automation scripts for our marketing metrics pipeline.',
      evidenceUrl: 'https://github.com/aarav-sharma/scripts'
    },
    {
      endorserId: aarav._id,
      recipientId: meera._id,
      skill: 'UI/UX',
      comment: 'Meera designed complete UI design systems with flawless token architecture and component libraries.',
      evidenceUrl: 'https://www.figma.com/@meera-design'
    },
    {
      endorserId: aarav._id,
      recipientId: rohan._id,
      skill: 'Communication',
      comment: 'Superb speech coaching and keynote structuring.',
      evidenceUrl: 'https://rohandas.com/speaking'
    }
  ]);

  // 5. Create Skill Verifications (Approved by Admin/Moderator, plus Pending)
  await SkillVerification.create([
    {
      userId: aarav._id,
      skill: 'Web Development',
      category: 'Web Development',
      evidenceUrl: 'https://github.com/aarav-sharma',
      notes: 'Maintained 3 production web apps and open source full-stack libraries.',
      status: 'approved',
      reviewedBy: rohan._id,
      reviewerNotes: 'Verified GitHub public repository code quality and production deployments.',
      reviewedAt: new Date(Date.now() - 7 * 86400000)
    },
    {
      userId: meera._id,
      skill: 'UI/UX',
      category: 'UI/UX',
      evidenceUrl: 'https://www.figma.com/@meera-design',
      notes: 'Lead designer on commercial client projects with published Figma design kits.',
      status: 'approved',
      reviewedBy: rohan._id,
      reviewerNotes: 'Verified Figma Community profile and high-fidelity project design documentation.',
      reviewedAt: new Date(Date.now() - 6 * 86400000)
    },
    {
      userId: aarav._id,
      skill: 'Python',
      category: 'Python',
      evidenceUrl: 'https://github.com/aarav-sharma/python-ml',
      notes: 'Automated data ingestion and FastAPI microservice implementation.',
      status: 'pending'
    }
  ]);

  // 6. Create Community Knowledge Hub Posts
  const post1 = await Post.create({
    authorId: aarav._id,
    contentType: 'tutorial',
    title: 'Mastering Real-Time Web Apps with Socket.IO & MongoDB Change Streams',
    content: 'Building responsive collaborative applications requires two key pillars: a robust persistent database (MongoDB) and bi-directional real-time communication channels (Socket.IO).\n\nKey takeaways:\n1. Always authenticate your socket handshakes using JWT.\n2. Partition broadcasts into scoped rooms (`user:<id>`, `post:<id>`).\n3. Sync initial state through REST APIs and let sockets push instant incremental updates.',
    tags: ['web development', 'nodejs', 'socketio', 'mongodb'],
    resourceLink: 'https://socket.io/docs/v4/',
    resourceTitle: 'Official Socket.IO Documentation',
    reactionsCount: { like: 2, helpful: 2 },
    commentsCount: 2
  });

  const post2 = await Post.create({
    authorId: meera._id,
    contentType: 'notes',
    title: 'Design System Foundations: Spacing Scales and Color Tokens',
    content: 'A cohesive UI design system relies on mathematical spacing rhythms. Use a 4px/8px base grid and semantic color tokens (`--bg-primary`, `--accent-brand`) to guarantee consistency between dark and light themes.',
    tags: ['ui/ux', 'design systems', 'figma', 'css'],
    resourceLink: 'https://www.figma.com/community',
    resourceTitle: 'Figma Community Design Systems',
    reactionsCount: { like: 1, helpful: 1 },
    commentsCount: 1
  });

  const post3 = await Post.create({
    authorId: rohan._id,
    contentType: 'learning-tip',
    title: '3 Public Speaking Habits That Immediately Boost Technical Pitch Impact',
    content: '1. Start with the tension before presenting the solution.\n2. Slow down your cadence when presenting critical architecture metrics.\n3. Make direct eye contact with one person per thought.',
    tags: ['communication', 'public speaking', 'leadership', 'career'],
    reactionsCount: { like: 0, helpful: 0 },
    commentsCount: 0
  });

  const post4 = await Post.create({
    authorId: ananya._id,
    contentType: 'resource-link',
    title: 'PyTorch Multimodal Vision-Language Architecture Cheat Sheet',
    content: 'Comprehensive reference notes on contrastive loss, patch embeddings for vision transformers, and efficient fine-tuning techniques using LoRA.',
    tags: ['ai/ml', 'python', 'pytorch', 'deep learning'],
    resourceLink: 'https://pytorch.org/tutorials/',
    resourceTitle: 'PyTorch Official Deep Learning Tutorials',
    reactionsCount: { like: 0, helpful: 0 },
    commentsCount: 1
  });

  // 7. Seed Comments
  await Comment.create([
    {
      postId: post1._id,
      authorId: meera._id,
      content: 'Incredible breakdown Aarav! The room partitioning approach makes instant UI updates feel seamless without unnecessary global broadcasts.',
      parentId: null
    },
    {
      postId: post1._id,
      authorId: rohan._id,
      content: 'Solid writeup. Testing with two concurrent browser sessions really highlights why socket sync is so much better than manual refresh.',
      parentId: null
    },
    {
      postId: post2._id,
      authorId: aarav._id,
      content: 'This explains why semantic CSS variables make dark/light theme switching so effortless.',
      parentId: null
    },
    {
      postId: post4._id,
      authorId: rohan._id,
      content: 'Thanks Ananya! Bookmarked this for automating our data pipelines with Python.',
      parentId: null
    }
  ]);

  // 8. Seed Reactions
  await Reaction.create([
    { userId: meera._id, postId: post1._id, reactionType: 'like' },
    { userId: meera._id, postId: post1._id, reactionType: 'helpful' },
    { userId: rohan._id, postId: post1._id, reactionType: 'like' },
    { userId: rohan._id, postId: post1._id, reactionType: 'helpful' },
    { userId: aarav._id, postId: post2._id, reactionType: 'like' },
    { userId: aarav._id, postId: post2._id, reactionType: 'helpful' }
  ]);

  // 9. Seed Bookmarks (Private to Aarav)
  await Bookmark.create([
    { userId: aarav._id, postId: post2._id },
    { userId: aarav._id, postId: post4._id }
  ]);

  // Seed Bookmark for Meera
  await Bookmark.create([
    { userId: meera._id, postId: post1._id }
  ]);

  await ensureUserSkillsAndArtifacts();

  console.log('[Seed] Database successfully populated with initial users, sessions, reviews, endorsements, and community posts.');
}

module.exports = { seedDatabase };
