// Unit tests for Quiz Attempts persistence, Revision Tracking, and Mastery Evidence
const assert = require('node:assert/strict');
const { initDb } = require('../../lib/db.cjs');

async function runQuizDbTests() {
  console.log('--- Running Quiz DB & Mastery Evidence Unit Tests ---');
  const db = initDb(':memory:');

  // Create test users
  const alice = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-alice-1',
    email: 'alice@example.com',
    name: 'Alice Walker'
  });

  const bob = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-bob-2',
    email: 'bob@example.com',
    name: 'Bob Smith'
  });

  const actId = 'day-01-act-01';
  const rev1 = '2026.10.30-rev1';
  const rev2 = '2026.10.30-rev2';

  // 1. Record an independent quiz attempt
  console.log('1. Recording independent quiz attempt...');
  const attempt1 = db.recordQuizAttempt({
    userId: alice.id,
    activityId: actId,
    contentRevision: rev1,
    assistanceMode: 'independent',
    answers: { q1: 'b', q2: 'c', q3: 'b' },
    score: 100,
    passed: 1
  });

  assert.ok(attempt1.id, 'Attempt must have a generated UUID');
  assert.equal(attempt1.user_id, alice.id);
  assert.equal(attempt1.activity_id, actId);
  assert.equal(attempt1.content_revision, rev1);
  assert.equal(attempt1.assistance_mode, 'independent');
  assert.equal(attempt1.score, 100);
  assert.equal(attempt1.passed, 1);
  assert.ok(attempt1.created_at);

  // 2. Assistance mode validation: only 'independent' and 'agent_assisted' allowed
  console.log('2. Verifying assistance mode validation...');
  assert.throws(() => {
    db.recordQuizAttempt({
      userId: alice.id,
      activityId: actId,
      contentRevision: rev1,
      assistanceMode: 'magic_ai', // invalid!
      answers: {},
      score: 50,
      passed: 0
    });
  }, /Invalid assistance mode/i);

  // 3. Multi-user isolation: Bob cannot see Alice's attempts
  console.log('3. Verifying multi-user isolation on quiz attempts...');
  const aliceAttempts = db.getQuizAttempts(alice.id, actId);
  assert.equal(aliceAttempts.length, 1);
  assert.equal(aliceAttempts[0].id, attempt1.id);

  const bobAttempts = db.getQuizAttempts(bob.id, actId);
  assert.equal(bobAttempts.length, 0, 'Bob must not see Alice quiz attempts');

  // 4. Distinction between Independent and Agent-Assisted checks
  console.log('4. Verifying distinct Independent vs Agent-Assisted checks...');
  const attempt2 = db.recordQuizAttempt({
    userId: alice.id,
    activityId: actId,
    contentRevision: rev1,
    assistanceMode: 'agent_assisted',
    answers: { q1: 'b', q2: 'c', q3: 'b' },
    score: 100,
    passed: 1
  });

  const summaryRev1 = db.getUserMasterySummary(alice.id, actId, rev1);
  assert.equal(summaryRev1.has_independent_pass, true, 'Alice should have independent pass');
  assert.equal(summaryRev1.has_agent_assisted_pass, true, 'Alice should have agent-assisted pass');
  assert.equal(summaryRev1.stale_attempts_count, 0, 'No attempts are stale for rev1');
  assert.equal(summaryRev1.self_reported_completed, false, 'Self-reported completed must be false initially');

  // 5. Self-reported checkbox completion cannot mint verified quiz evidence
  console.log('5. Verifying self-reported completion cannot mint verified mastery...');
  db.saveProgress({
    userId: bob.id,
    activityId: actId,
    draftText: 'Bob self-marks completion without taking the quiz',
    completed: 1
  });

  const bobSummary = db.getUserMasterySummary(bob.id, actId, rev1);
  assert.equal(bobSummary.self_reported_completed, true, 'Bob self-reported checkbox is completed');
  assert.equal(bobSummary.has_independent_pass, false, 'Self-reported completion CANNOT mint independent pass');
  assert.equal(bobSummary.has_agent_assisted_pass, false, 'Self-reported completion CANNOT mint agent-assisted pass');

  // 6. Content Revision Tracking & Stale Evidence
  console.log('6. Verifying content revision change marks prior attempts as stale...');
  // Suppose course author updates quiz to rev2
  const summaryRev2 = db.getUserMasterySummary(alice.id, actId, rev2);
  assert.equal(summaryRev2.has_independent_pass, false, 'Old rev1 pass does NOT certify rev2 material');
  assert.equal(summaryRev2.has_agent_assisted_pass, false, 'Old rev1 pass does NOT certify rev2 material');
  assert.equal(summaryRev2.stale_attempts_count, 2, 'Alice has 2 historical attempts needing revalidation');
  assert.equal(summaryRev2.attempts.length, 2);
  assert.equal(summaryRev2.attempts[0].is_stale, true, 'Attempt should be marked is_stale');

  // When Alice takes the quiz again under rev2:
  const attempt3 = db.recordQuizAttempt({
    userId: alice.id,
    activityId: actId,
    contentRevision: rev2,
    assistanceMode: 'independent',
    answers: { q1: 'b', q2: 'c', q3: 'b' },
    score: 100,
    passed: 1
  });

  const summaryRev2After = db.getUserMasterySummary(alice.id, actId, rev2);
  assert.equal(summaryRev2After.has_independent_pass, true, 'Alice revalidated under rev2');
  assert.equal(summaryRev2After.stale_attempts_count, 2, 'Historical rev1 attempts still preserved in history');

  console.log('>>> All Quiz DB Unit Tests Passed! <<<');
}

runQuizDbTests().catch(err => {
  console.error('Quiz DB unit tests failed:', err);
  process.exit(1);
});
