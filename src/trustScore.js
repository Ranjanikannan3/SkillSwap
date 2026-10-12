const { LearningSession, Review, Endorsement, SkillVerification, Report } = require('./models');

/**
 * Calculates a transparent, verifiable Trust Score for a user
 * based on documented platform activity.
 * 
 * Rules:
 * - Completed verified sessions (up to 35 pts)
 * - Moderator-approved skill verifications (up to 30 pts)
 * - Authentic peer reviews & ratings (up to 20 pts)
 * - Peer endorsements for demonstrated skills (up to 15 pts)
 * - Deductions for upheld moderation violations (-20 pts each)
 */
async function calculateUserTrustMetrics(userId) {
  const [sessions, reviews, endorsements, verifications, reportsAgainst] = await Promise.all([
    // 1. Completed sessions where user participated
    LearningSession.find({
      $or: [{ mentorId: userId }, { learnerId: userId }],
      status: 'completed'
    }),

    // 2. Reviews received from peers
    Review.find({ revieweeId: userId }).populate('reviewerId', 'name email'),

    // 3. Endorsements received from other users (exclude self)
    Endorsement.find({ recipientId: userId, endorserId: { $ne: userId } })
      .populate('endorserId', 'name email'),

    // 4. Approved formal verifications by moderators
    SkillVerification.find({ userId, status: 'approved' }),

    // 5. Upheld reports against this user
    Report.find({ targetId: userId, targetType: 'user', status: 'resolved' })
  ]);

  const completedSessionsCount = sessions.length;
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0
    ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
    : 0;

  // Group endorsements by skill
  const endorsementsBySkill = {};
  endorsements.forEach(e => {
    endorsementsBySkill[e.skill] = (endorsementsBySkill[e.skill] || 0) + 1;
  });

  const verifiedSkillsCount = verifications.length;
  const verifiedSkillsList = verifications.map(v => ({
    id: v._id,
    skill: v.skill,
    category: v.category,
    evidenceUrl: v.evidenceUrl,
    reviewedAt: v.reviewedAt
  }));

  // Points breakdown calculation
  // 1. Session Completion: 5 pts per session, max 35
  const sessionPoints = Math.min(35, completedSessionsCount * 5);

  // 2. Moderator Verifications: 15 pts per verified skill, max 30
  const verificationPoints = Math.min(30, verifiedSkillsCount * 15);

  // 3. Peer Reviews: (avg rating / 5) * 20 scaled by review volume
  let reviewPoints = 0;
  if (reviewCount > 0) {
    const volumeMultiplier = Math.min(1, reviewCount / 3); // Full points at 3+ reviews
    reviewPoints = Math.round((averageRating / 5) * 20 * volumeMultiplier);
  }

  // 4. Peer Endorsements: 3 pts per unique endorsement, max 15
  const endorsementPoints = Math.min(15, endorsements.length * 3);

  // 5. Deductions
  const reportPenalty = reportsAgainst.length * 20;

  // Base onboarding activity points
  const basePoints = 5;

  let rawScore = basePoints + sessionPoints + verificationPoints + reviewPoints + endorsementPoints - reportPenalty;
  const trustScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Calculate Level and Badge
  let trustTier = 'New Member';
  let tierBadge = '🌱';
  if (trustScore >= 80) {
    trustTier = 'Distinguished Peer';
    tierBadge = '👑';
  } else if (trustScore >= 60) {
    trustTier = 'Verified Contributor';
    tierBadge = '🛡️';
  } else if (trustScore >= 40) {
    trustTier = 'Trusted Collaborator';
    tierBadge = '⭐';
  } else if (trustScore >= 20) {
    trustTier = 'Active Learner';
    tierBadge = '⚡';
  }

  return {
    trustScore,
    trustTier,
    tierBadge,
    metrics: {
      completedSessionsCount,
      reviewCount,
      averageRating,
      verifiedSkillsCount,
      endorsementsCount: endorsements.length
    },
    breakdown: [
      {
        factor: 'Completed Exchange Sessions',
        pointsAwarded: sessionPoints,
        maxPoints: 35,
        detail: `${completedSessionsCount} confirmed session${completedSessionsCount === 1 ? '' : 's'} (5 pts each, max 35)`
      },
      {
        factor: 'Moderator-Approved Skill Verifications',
        pointsAwarded: verificationPoints,
        maxPoints: 30,
        detail: `${verifiedSkillsCount} officially approved skill${verifiedSkillsCount === 1 ? '' : 's'} (15 pts each, max 30)`
      },
      {
        factor: 'Peer Reviews & Quality Rating',
        pointsAwarded: reviewPoints,
        maxPoints: 20,
        detail: reviewCount > 0
          ? `${reviewCount} review${reviewCount === 1 ? '' : 's'} with ${averageRating} / 5.0 avg rating`
          : 'No peer reviews received yet'
      },
      {
        factor: 'Peer Skill Endorsements',
        pointsAwarded: endorsementPoints,
        maxPoints: 15,
        detail: `${endorsements.length} peer endorsement${endorsements.length === 1 ? '' : 's'} (3 pts each, max 15)`
      },
      {
        factor: 'Moderation Violations',
        pointsAwarded: -reportPenalty,
        maxPoints: 0,
        detail: reportsAgainst.length > 0 ? `${reportsAgainst.length} confirmed policy infractions (-20 pts each)` : 'Clean standing'
      }
    ],
    endorsementsBySkill,
    verifiedSkillsList,
    recentReviews: reviews.slice(0, 10).map(r => ({
      id: r._id,
      sessionId: r.sessionId,
      reviewer: r.reviewerId ? { id: r.reviewerId._id, name: r.reviewerId.name, email: r.reviewerId.email } : null,
      rating: r.rating,
      comment: r.comment,
      skill: r.skill,
      createdAt: r.createdAt
    })),
    disclaimer: 'The SkillSwap Trust Score is an algorithmic reputation metric calculated transparently from completed learning sessions, peer reviews, peer endorsements, and moderator-verified credentials. It is not an employment guarantee or absolute proof of competence.'
  };
}

module.exports = {
  calculateUserTrustMetrics
};
