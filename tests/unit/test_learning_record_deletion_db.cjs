const assert = require('node:assert/strict');
const { initDb } = require('../../lib/db.cjs');

const db = initDb(':memory:');
const alice = db.upsertUser({ provider: 'google', providerUserId: 'delete-alice', email: 'delete-alice@example.com', name: 'Delete Alice' });
const bob = db.upsertUser({ provider: 'google', providerUserId: 'delete-bob', email: 'delete-bob@example.com', name: 'Delete Bob' });

db.saveProgress({ userId: alice.id, activityId: 'day-01-act-01', draftText: 'private', completed: 1 });
db.setUserTrack(alice.id, 'codex');
db.recordQuizAttempt({ userId: alice.id, activityId: 'day-01-act-01', contentRevision: '1', assistanceMode: 'independent', answers: { q: 'a' }, score: 100, passed: true });
db.saveProjectSubmission({ userId: alice.id, projectId: 'day-01-act-01', revision: '1', assistanceMode: 'independent', textNotes: 'private evidence' });
db.saveReviewPlan({ userId: alice.id, diagnosticsSummary: { results: { q: { correct: false } } }, recommendedPlan: { summary: 'private' }, items: [{ concept_id: 'x' }] });
db.saveProgress({ userId: bob.id, activityId: 'day-01-act-01', draftText: 'keep me' });

const result = db.deleteLearningRecords(alice.id);
assert.equal(result.success, true);
assert.equal(result.account_retained, true);
assert.deepEqual(result.deleted.sort(), [
  'diagnostic_attempts', 'progress', 'project_submissions', 'quiz_attempts', 'review_plans', 'user_tracks'
]);
assert.equal(db.getAllProgress(alice.id).length, 0);
assert.equal(db.getQuizAttempts(alice.id).length, 0);
assert.equal(db.getAllProjectSubmissions(alice.id).length, 0);
assert.equal(db.getReviewPlan(alice.id), null);
assert.equal(db.getDiagnosticAttempts(alice.id).length, 0);
assert.equal(db.getUserTrack(alice.id), null);
assert.ok(db.getUserById(alice.id), 'account identity is retained');
assert.equal(db.getAllProgress(bob.id).length, 1, 'another owner is untouched');

const repeated = db.deleteLearningRecords(alice.id);
assert.equal(repeated.success, true);
assert.ok(repeated.already_empty);
assert.ok(db.getUserById(alice.id));

console.log('Learning record deletion DB tests passed.');
