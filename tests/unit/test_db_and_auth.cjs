// Unit test for SQLite persistence, Auth sessions, and Multi-user progress isolation
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// We require the db module which we are about to build
const { initDb } = require('../../lib/db.cjs');

async function runTests() {
  console.log('--- Running DB & Auth Unit Tests ---');

  // Use an in-memory database for unit testing
  const db = initDb(':memory:');
  assert.ok(db, 'Database should initialize');

  // 1. User creation and deduplication by provider + provider_user_id
  console.log('1. Testing user upsert...');
  const user1 = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-sub-12345',
    email: 'alice@example.com',
    name: 'Alice Walker'
  });
  assert.ok(user1.id, 'User must have an ID');
  assert.equal(user1.email, 'alice@example.com');
  assert.equal(user1.name, 'Alice Walker');

  // Updating user profile with same provider + provider_user_id preserves ID
  const updatedUser1 = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-sub-12345',
    email: 'alice-new@example.com',
    name: 'Alice Walker Updated'
  });
  assert.equal(updatedUser1.id, user1.id, 'User ID should remain stable across updates');
  assert.equal(updatedUser1.email, 'alice-new@example.com');

  // Create second user Bob
  const user2 = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-sub-67890',
    email: 'bob@example.com',
    name: 'Bob Smith'
  });
  assert.notEqual(user2.id, user1.id, 'User IDs must be distinct');

  // 2. Session management and expiry
  console.log('2. Testing session creation and expiry...');
  const session1 = db.createSession(user1.id, 1000); // 1 second TTL
  assert.ok(session1.token, 'Session must generate a token');

  const retrievedSession = db.getSession(session1.token);
  assert.ok(retrievedSession, 'Active session must be retrieved');
  assert.equal(retrievedSession.user_id, user1.id);
  assert.equal(retrievedSession.name, 'Alice Walker Updated');

  // Expired session check
  const expiredSession = db.createSession(user1.id, -100); // already expired
  const checkExpired = db.getSession(expiredSession.token);
  assert.equal(checkExpired, null, 'Expired session must return null');

  // Session deletion (logout)
  db.deleteSession(session1.token);
  assert.equal(db.getSession(session1.token), null, 'Deleted session must return null');

  // 3. OAuth State token generation and single-use consumption
  console.log('3. Testing OAuth state creation and single-use consumption...');
  const stateToken = 'random-oauth-state-xyz';
  db.createOAuthState(stateToken, 5000, '/zh-Hans/day-01');
  
  const consumed = db.consumeOAuthState(stateToken);
  assert.ok(consumed, 'Valid state must be consumed successfully');
  assert.equal(consumed.return_url, '/zh-Hans/day-01');

  // Second consumption must fail (single-use)
  const consumedAgain = db.consumeOAuthState(stateToken);
  assert.equal(consumedAgain, null, 'Re-using an OAuth state token must be denied');

  // Non-existent or expired state
  assert.equal(db.consumeOAuthState('non-existent-state'), null);

  // 4. Progress persistence and multi-user isolation
  console.log('4. Testing progress persistence and isolation...');
  const actId = 'day-01-act-01';

  // Alice saves progress
  const save1 = db.saveProgress({
    userId: user1.id,
    activityId: actId,
    draftText: "Alice's draft prediction: rebinding vs mutation",
    completed: 1,
    expectedVersion: 0
  });
  assert.equal(save1.success, true);
  assert.equal(save1.version, 1);

  // Alice reads progress
  const aliceProgress = db.getProgress(user1.id, actId);
  assert.ok(aliceProgress);
  assert.equal(aliceProgress.draft_text, "Alice's draft prediction: rebinding vs mutation");
  assert.equal(aliceProgress.completed, 1);
  assert.equal(aliceProgress.version, 1);

  // Bob reads progress - must NOT see Alice's data!
  const bobProgress = db.getProgress(user2.id, actId);
  assert.equal(bobProgress, null, 'Bob must not see Alice progress');

  // Bob saves his own progress
  const bobSave = db.saveProgress({
    userId: user2.id,
    activityId: actId,
    draftText: "Bob's completely different prediction",
    completed: 0,
    expectedVersion: 0
  });
  assert.equal(bobSave.success, true);

  const bobProgressAfter = db.getProgress(user2.id, actId);
  assert.equal(bobProgressAfter.draft_text, "Bob's completely different prediction");
  assert.equal(bobProgressAfter.completed, 0);

  // Alice's progress remains untouched
  const aliceCheck = db.getProgress(user1.id, actId);
  assert.equal(aliceCheck.draft_text, "Alice's draft prediction: rebinding vs mutation");

  // 5. Concurrency versioning
  console.log('5. Testing optimistic concurrency version conflict...');
  // Expected version 1 passes and updates to version 2
  const updateAlice = db.saveProgress({
    userId: user1.id,
    activityId: actId,
    draftText: "Alice's updated draft",
    completed: 1,
    expectedVersion: 1
  });
  assert.equal(updateAlice.success, true);
  assert.equal(updateAlice.version, 2);

  // Stale update (expectedVersion 1 when DB is now version 2) must return conflict
  const staleUpdate = db.saveProgress({
    userId: user1.id,
    activityId: actId,
    draftText: "Alice's stale concurrent write",
    completed: 1,
    expectedVersion: 1
  });
  assert.equal(staleUpdate.success, false);
  assert.equal(staleUpdate.conflict, true);
  assert.equal(staleUpdate.currentVersion, 2);

  // 6. Strict no-silent-merge across providers for identical email strings
  console.log('6. Testing strict no-silent-merge across providers...');
  const sharedEmail = 'carol@example.com';
  const carolGoogle = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-carol-101',
    email: sharedEmail,
    name: 'Carol Google'
  });
  const carolGitHub = db.upsertUser({
    provider: 'github',
    providerUserId: 'github-carol-202',
    email: sharedEmail,
    name: 'Carol GitHub'
  });

  assert.ok(carolGoogle.id, 'Carol Google must have an ID');
  assert.ok(carolGitHub.id, 'Carol GitHub must have an ID');
  assert.notEqual(
    carolGoogle.id,
    carolGitHub.id,
    'Identical email strings across providers must NEVER silently merge accounts!'
  );

  // Verify their progress records are strictly isolated
  db.saveProgress({
    userId: carolGoogle.id,
    activityId: 'day-01-act-01',
    draftText: 'Carol Google private notes',
    completed: 1
  });
  const githubProgress = db.getProgress(carolGitHub.id, 'day-01-act-01');
  assert.equal(githubProgress, null, 'GitHub account must not see Google account progress');

  // 7. Explicit account linking, multi-identity retrieval, and conflict rejection
  console.log('7. Testing explicit account linking and conflict rejection...');
  // Explicitly link a secondary GitHub identity to Carol Google
  const linkResult = db.linkOAuthIdentity({
    userId: carolGoogle.id,
    provider: 'github',
    providerUserId: 'github-carol-linked-303',
    email: 'carol-linked@example.com',
    name: 'Carol GitHub Linked'
  });
  assert.equal(linkResult.success, true, 'Explicit linking must succeed for unbound identity');

  // Carol Google can now be looked up via the newly linked GitHub identity
  const userByLinked = db.findUserByOAuthIdentity('github', 'github-carol-linked-303');
  assert.ok(userByLinked, 'User must be found by linked secondary identity');
  assert.equal(userByLinked.id, carolGoogle.id, 'Lookup by linked identity must return Carol Google user ID');

  // Multi-identity list for Carol Google
  const identities = db.getIdentitiesForUser(carolGoogle.id);
  assert.equal(identities.length, 2, 'User must have exactly 2 linked identities');
  const providers = identities.map(i => i.provider).sort();
  assert.deepEqual(providers, ['github', 'google']);

  // Conflict rejection: Carol Google attempts to link github-carol-202 (already owned by carolGitHub)
  const conflictResult = db.linkOAuthIdentity({
    userId: carolGoogle.id,
    provider: 'github',
    providerUserId: 'github-carol-202', // Already belongs to carolGitHub!
    email: 'carol-attacker@example.com',
    name: 'Carol Hijack Attempt'
  });
  assert.equal(conflictResult.success, false, 'Linking conflicting identity must be rejected');
  assert.equal(conflictResult.conflict, true, 'Result must indicate conflict');
  assert.equal(conflictResult.conflictingUserId, carolGitHub.id);

  // Verify Carol GitHub account and records were NOT corrupted or deleted
  const carolGitHubStillExists = db.getUserById(carolGitHub.id);
  assert.ok(carolGitHubStillExists, 'Conflicting user account must NOT be deleted');
  const githubUserIdentities = db.getIdentitiesForUser(carolGitHub.id);
  assert.equal(githubUserIdentities.length, 1);
  assert.equal(githubUserIdentities[0].provider_user_id, 'github-carol-202');

  // Verify Carol Google's identities were NOT corrupted
  const carolGoogleIdentitiesAfter = db.getIdentitiesForUser(carolGoogle.id);
  assert.equal(carolGoogleIdentitiesAfter.length, 2);

  // Idempotent linking of an already linked identity to the same user
  const idempotentResult = db.linkOAuthIdentity({
    userId: carolGoogle.id,
    provider: 'github',
    providerUserId: 'github-carol-linked-303',
    email: 'carol-linked@example.com',
    name: 'Carol GitHub Linked'
  });
  assert.equal(idempotentResult.success, true);
  assert.equal(idempotentResult.alreadyLinked, true);

  console.log('>>> All DB & Auth unit tests passed! <<<');
}

runTests().catch(err => {
  console.error('Unit test failed:', err);
  process.exit(1);
});
