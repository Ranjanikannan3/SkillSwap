const mongoose = require('mongoose');
const { Schema } = mongoose;

/* =====================================================================
   SKILLSWAP MONGOOSE SCHEMAS & MODELS
   ===================================================================== */

// 1. User Schema
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  systemRole: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
  role: { type: String, default: 'Student' }, // Persona role: 'Student' | 'Professional'
  institution: { type: String, default: '', trim: true },
  education: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  bio: { type: String, default: '', trim: true },
  interests: { type: String, default: '', trim: true },
  
  // Skills offered to teach
  skillsOffered: [{
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'General', trim: true },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], default: 'Intermediate' },
    description: { type: String, default: '', trim: true },
    format: { type: String, default: '1-on-1 Session' }
  }],

  // Skills wanted to learn
  skillsWanted: [{
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'General', trim: true },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], default: 'Beginner' },
    description: { type: String, default: '', trim: true }
  }],

  preferredMethods: [{ type: String, trim: true }],
  availability: [{ type: String, trim: true }], // e.g. 'Weekday Evenings', 'Weekends'

  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

  legacyId: { type: Number, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 2. Learning Session / Exchange Request Schema
const learningSessionSchema = new Schema({
  mentorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  learnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skill: { type: String, required: true, trim: true }, // Skill being taught/learned
  teachSkill: { type: String, default: '', trim: true },
  learnSkill: { type: String, default: '', trim: true },
  category: { type: String, default: 'General', trim: true },
  date: { type: Date, required: true },
  time: { type: String, default: '18:00', trim: true },
  duration: { type: Number, default: 60 }, // duration in minutes
  minutes: { type: Number, default: 60 },
  message: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  
  // State lifecycle:
  // pending -> accepted -> completed (or rejected / cancelled / missed / rescheduled)
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed', 'cancelled', 'missed', 'rescheduled'],
    default: 'pending',
    index: true
  },
  
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, default: '' },
  rescheduledTo: {
    date: { type: Date, default: null },
    time: { type: String, default: null }
  },
  completedAt: { type: Date, default: null },
  completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

learningSessionSchema.index({ mentorId: 1, learnerId: 1, date: 1 });

// 3. Post Schema (Community Knowledge Hub)
const postSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contentType: {
    type: String,
    enum: ['notes', 'tutorial', 'learning-tip', 'resource-link', 'discussion'],
    default: 'notes',
    index: true
  },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, required: true, trim: true, maxlength: 10000 },
  tags: [{ type: String, trim: true, lowercase: true }],
  resourceLink: { type: String, trim: true, default: '' },
  resourceTitle: { type: String, trim: true, default: '' },
  reactionsCount: {
    like: { type: Number, default: 0 },
    helpful: { type: Number, default: 0 }
  },
  commentsCount: { type: Number, default: 0 },
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

postSchema.index({ tags: 1 });
postSchema.index({ contentType: 1, createdAt: -1 });

// 4. Reaction Schema
const reactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  reactionType: { type: String, enum: ['like', 'helpful'], required: true },
  createdAt: { type: Date, default: Date.now }
});
reactionSchema.index({ userId: 1, postId: 1, reactionType: 1 }, { unique: true });

// 5. Comment Schema
const commentSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
  content: { type: String, required: true, trim: true, maxlength: 3000 },
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// 6. Bookmark Schema
const bookmarkSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});
bookmarkSchema.index({ userId: 1, postId: 1 }, { unique: true });

// 7. Review Schema
const reviewSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, ref: 'LearningSession', required: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  revieweeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, maxlength: 2000 },
  skill: { type: String, required: true, trim: true },
  isEdited: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
reviewSchema.index({ sessionId: 1, reviewerId: 1 }, { unique: true });
reviewSchema.index({ revieweeId: 1, createdAt: -1 });

// 8. Endorsement Schema
const endorsementSchema = new Schema({
  endorserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skill: { type: String, required: true, trim: true },
  comment: { type: String, default: '', trim: true, maxlength: 1000 },
  evidenceUrl: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now }
});
endorsementSchema.index({ endorserId: 1, recipientId: 1, skill: 1 }, { unique: true });

// 9. Skill Verification Schema
const skillVerificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  skill: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  evidenceUrl: { type: String, required: true, trim: true },
  notes: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewerNotes: { type: String, default: '', trim: true },
  reviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
skillVerificationSchema.index({ userId: 1, skill: 1 });

// 10. Report Schema
const reportSchema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['post', 'comment', 'review', 'user', 'message'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  reason: { type: String, required: true, trim: true },
  details: { type: String, default: '', trim: true },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending', index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionNotes: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now }
});

// 11. Block Schema
const blockSchema = new Schema({
  blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

// 12. Conversation Schema (1-to-1 Live Chat)
const conversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: String, default: '' },
  lastMessageSenderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastMessageAt: { type: Date, default: Date.now },
  unreadCounts: { type: Map, of: Number, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

// 13. Message Schema
const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 4000 },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});
messageSchema.index({ conversationId: 1, createdAt: 1 });

// 14. Notification Schema
const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  type: {
    type: String,
    enum: ['message', 'request', 'session_accepted', 'session_completed', 'session_cancelled', 'review', 'endorsement', 'verification', 'comment', 'reaction', 'system'],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, default: '' },
  isRead: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// 15. Learning Goal Schema
const goalSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  skill: { type: String, required: true, trim: true },
  targetDate: { type: Date, default: null },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  milestones: [{
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
goalSchema.index({ userId: 1, createdAt: -1 });

// 16. Activity Ledger Schema (For learning streaks and granular session logs)
const activitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['taught', 'learned', 'practiced'], default: 'learned' },
  skill: { type: String, required: true, trim: true },
  partner: { type: String, default: '', trim: true },
  partnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  minutes: { type: Number, default: 60 },
  date: { type: Date, default: Date.now, index: true },
  rating: { type: Number, default: 5 },
  notes: { type: String, default: '', trim: true },
  sessionId: { type: Schema.Types.ObjectId, ref: 'LearningSession', default: null },
  createdAt: { type: Date, default: Date.now }
});
activitySchema.index({ userId: 1, date: -1 });

module.exports = {
  User: mongoose.model('User', userSchema),
  LearningSession: mongoose.model('LearningSession', learningSessionSchema),
  Post: mongoose.model('Post', postSchema),
  Reaction: mongoose.model('Reaction', reactionSchema),
  Comment: mongoose.model('Comment', commentSchema),
  Bookmark: mongoose.model('Bookmark', bookmarkSchema),
  Review: mongoose.model('Review', reviewSchema),
  Endorsement: mongoose.model('Endorsement', endorsementSchema),
  SkillVerification: mongoose.model('SkillVerification', skillVerificationSchema),
  Report: mongoose.model('Report', reportSchema),
  Block: mongoose.model('Block', blockSchema),
  Conversation: mongoose.model('Conversation', conversationSchema),
  Message: mongoose.model('Message', messageSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Goal: mongoose.model('Goal', goalSchema),
  Activity: mongoose.model('Activity', activitySchema)
};
