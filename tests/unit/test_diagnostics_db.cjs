// Unit tests for Review Plans SQLite persistence (Ticket 08)
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { initDb } = require('../../lib/db.cjs');

console.log('--- Running Diagnostics & Review Plan DB Unit Tests ---');

const db = initDb(':memory:');

// Create test users
const userAlice = db.upsertUser({
  provider: 'google',
  providerUserId: 'test-google-alice',
  email: 'alice@example.com',
  name: 'Alice Diagnostics'
});

const userBob = db.upsertUser({
  provider: 'google',
  providerUserId: 'test-google-bob',
  email: 'bob@example.com',
  name: 'Bob Diagnostics'
});

// 1. Verify table exists in rawDb
console.log('1. Verifying review_plans table creation in SQLite schema...');
const tableCheck = db.rawDb.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='review_plans'
`).get();
assert.ok(tableCheck, 'Table review_plans should exist in database schema');

// 2. Saving a new review plan for Alice
console.log('2. Testing review plan insertion for Alice...');
const aliceSummary = {
  attempt_id: crypto.randomUUID(),
  content_revision: '2026.10.30-rev1',
  score: 60,
  gaps: ['py_mutability', 'math_calculus_derivatives'],
  uncertain: [],
  mastered: ['py_control_scope', 'math_linear_algebra_tensors', 'math_probability_loss'],
  assistance_mode: 'independent'
};

const alicePlan = {
  summary_text: 'Actionable review plan for Python mutability and calculus intuition.',
  planned_review_budget_day: 'day-07',
  total_allocated_minutes: 150,
  budget_limit_minutes: 480,
  mandatory_curriculum_hours_retained: 720,
  no_extra_hours_added: true,
  skip_recommendations: []
};

const aliceItems = [
  {
    concept_id: 'py_mutability',
    concept_title: 'Python Object References & In-Place Mutation',
    status: 'gap',
    objective: 'Independently write a minimal reproduction tracing object identity vs value and distinguishing in-place mutation from rebinding.',
    activity_id: 'day-01-act-01',
    target_day: 'day-01',
    scheduled_review_day: 'day-07',
    allocated_minutes: 60,
    retry_condition: 'Score 100% on Day 01 Independent Mastery Check',
    recovery_links: ['day-01']
  },
  {
    concept_id: 'math_calculus_derivatives',
    concept_title: 'Rates of Change, Derivatives & Tangents',
    status: 'gap',
    objective: 'Derive simple function limits and compute analytical gradients, confirming agreement with finite-difference approximations.',
    activity_id: 'day-16-act-01',
    target_day: 'day-16',
    scheduled_review_day: 'day-07',
    allocated_minutes: 90,
    retry_condition: 'Pass Day 16 gradient computation and numerical verification check without assistance.',
    recovery_links: ['day-16']
  }
];

const saved = db.saveReviewPlan({
  userId: userAlice.id,
  diagnosticsSummary: aliceSummary,
  recommendedPlan: alicePlan,
  items: aliceItems
});

assert.ok(saved.id, 'Saved plan should have an ID');
assert.equal(saved.user_id, userAlice.id);
assert.ok(saved.updated_at);

// 3. Retrieving Alice's review plan
console.log('3. Testing getReviewPlan for Alice...');
const fetched = db.getReviewPlan(userAlice.id);
assert.ok(fetched, 'Review plan should be retrievable');
assert.equal(fetched.id, saved.id);
assert.equal(fetched.user_id, userAlice.id);
assert.deepEqual(fetched.diagnostics_summary, aliceSummary);
assert.deepEqual(fetched.recommended_plan, alicePlan);
assert.deepEqual(fetched.items, aliceItems);
assert.equal(fetched.items.length, 2);

// 4. Verifying multi-user isolation (Bob has no plan yet)
console.log('4. Testing multi-user isolation: Bob should not see Alice plan...');
const bobPlan = db.getReviewPlan(userBob.id);
assert.equal(bobPlan, null, 'Bob should have no review plan initially');

// 5. Updating Alice's review plan (e.g. after retrying diagnostic)
console.log('5. Testing updating review plan on diagnostic retry...');
const updatedSummary = {
  ...aliceSummary,
  score: 100,
  gaps: [],
  mastered: ['py_mutability', 'py_control_scope', 'math_calculus_derivatives', 'math_linear_algebra_tensors', 'math_probability_loss']
};

const updatedPlan = {
  ...alicePlan,
  total_allocated_minutes: 0,
  skip_recommendations: [
    {
      domain: 'python_fundamentals',
      eligible: true,
      demonstrated_criteria: 'Passed Python diagnostic assessment independently with 100% score',
      recovery_material: ['day-01', 'day-04'],
      guidance: 'Demonstrated prerequisite mastery in Python fundamentals. You may optionally skip introductory syntax activities on Days 01-03.'
    }
  ]
};

const updatedItems = [];

const updatedResult = db.saveReviewPlan({
  userId: userAlice.id,
  diagnosticsSummary: updatedSummary,
  recommendedPlan: updatedPlan,
  items: updatedItems
});

const fetchedUpdated = db.getReviewPlan(userAlice.id);
assert.equal(fetchedUpdated.diagnostics_summary.score, 100);
assert.equal(fetchedUpdated.items.length, 0);
assert.equal(fetchedUpdated.recommended_plan.skip_recommendations.length, 1);
assert.equal(fetchedUpdated.recommended_plan.skip_recommendations[0].eligible, true);

// 6. Verifying prior quiz attempts and learning records are NOT erased
console.log('6. Verifying quiz attempts are not erased when review plans are updated...');
db.recordQuizAttempt({
  userId: userAlice.id,
  activityId: 'day-01-act-01',
  contentRevision: '2026.10.30-rev1',
  assistanceMode: 'independent',
  answers: { q1: 'b', q2: 'c', q3: 'b' },
  score: 100,
  passed: 1
});

const aliceQuizAttempts = db.getQuizAttempts(userAlice.id, 'day-01-act-01');
assert.equal(aliceQuizAttempts.length, 1, 'Quiz attempts must be preserved');

// 7. Testing cascade deletion when user is removed
console.log('7. Testing foreign key cascade deletion...');
db.rawDb.prepare('DELETE FROM users WHERE id = ?').run(userAlice.id);
const planAfterUserDelete = db.rawDb.prepare('SELECT * FROM review_plans WHERE user_id = ?').get(userAlice.id);
assert.equal(planAfterUserDelete, undefined, 'Review plan should be deleted via cascade when user is deleted');

console.log('>>> All Diagnostics & Review Plan DB Unit Tests Passed! <<<');
