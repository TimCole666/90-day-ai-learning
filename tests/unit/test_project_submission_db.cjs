// Unit tests for Project Submissions persistence, Bounded Constraints, and Evidence Status Separation
const assert = require('node:assert/strict');
const { initDb } = require('../../lib/db.cjs');

async function runProjectSubmissionDbTests() {
  console.log('--- Running Project Submission DB & Evidence Status Unit Tests ---');
  const db = initDb(':memory:');

  // Create test users
  const alice = db.upsertUser({
    provider: 'google',
    providerUserId: 'google-alice-proj',
    email: 'alice.proj@example.com',
    name: 'Alice Developer'
  });

  const bob = db.upsertUser({
    provider: 'github',
    providerUserId: 'github-bob-proj',
    email: 'bob.proj@example.com',
    name: 'Bob Engineer'
  });

  const projectId = 'day-01-act-01';
  const rev1 = '2026.10.30-rev1';
  const rev2 = '2026.10.30-rev2';

  // 1. Submit project submission
  console.log('1. Submitting project submission for Alice...');
  const sub1 = db.saveProjectSubmission({
    userId: alice.id,
    projectId,
    revision: rev1,
    assistanceMode: 'independent',
    selectedTrack: 'claude-code',
    repoUrl: 'https://github.com/alice/ai-learning-lab',
    reportUrl: 'https://alice.dev/reports/day01',
    textNotes: 'Initial diagnostic trace and MRE reproduction notes.'
  });

  assert.ok(sub1.id, 'Submission must have a generated UUID');
  assert.equal(sub1.user_id, alice.id);
  assert.equal(sub1.project_id, projectId);
  assert.equal(sub1.revision, rev1);
  assert.equal(sub1.assistance_mode, 'independent');
  assert.equal(sub1.selected_track, 'claude-code');
  assert.equal(sub1.repo_url, 'https://github.com/alice/ai-learning-lab');
  assert.equal(sub1.report_url, 'https://alice.dev/reports/day01');
  assert.equal(sub1.text_notes, 'Initial diagnostic trace and MRE reproduction notes.');
  assert.equal(sub1.evidence_status, 'self_reported', 'Evidence status must default to self_reported');
  assert.ok(sub1.created_at);
  assert.ok(sub1.updated_at);

  // 2. Retrieve submission
  console.log('2. Retrieving submission for Alice...');
  const fetched = db.getProjectSubmission(alice.id, projectId);
  assert.ok(fetched);
  assert.equal(fetched.id, sub1.id);
  assert.equal(fetched.repo_url, 'https://github.com/alice/ai-learning-lab');
  assert.equal(fetched.evidence_status, 'self_reported');

  // 3. Multi-user isolation: Bob cannot see Alice's submission
  console.log('3. Verifying multi-user isolation...');
  const bobSub = db.getProjectSubmission(bob.id, projectId);
  assert.equal(bobSub, null, "Bob must not see Alice's project submission");

  const bobList = db.getAllProjectSubmissions(bob.id);
  assert.equal(bobList.length, 0);

  const aliceList = db.getAllProjectSubmissions(alice.id);
  assert.equal(aliceList.length, 1);
  assert.equal(aliceList[0].id, sub1.id);

  // 4. Update existing submission
  console.log('4. Updating Alice submission...');
  const updated = db.saveProjectSubmission({
    userId: alice.id,
    projectId,
    revision: rev1,
    assistanceMode: 'agent_assisted',
    selectedTrack: 'codex',
    repoUrl: 'https://github.com/alice/ai-learning-lab-v2',
    reportUrl: 'https://alice.dev/reports/day01-v2',
    textNotes: 'Updated with agent-assisted test suite results.'
  });

  assert.equal(updated.id, sub1.id, 'Update should preserve the record ID');
  assert.equal(updated.assistance_mode, 'agent_assisted');
  assert.equal(updated.selected_track, 'codex');
  assert.equal(updated.repo_url, 'https://github.com/alice/ai-learning-lab-v2');
  assert.equal(updated.evidence_status, 'self_reported', 'Updating must NOT alter evidence status away from self_reported');

  // 5. Validation of URL schemes (must be http or https)
  console.log('5. Verifying URL scheme constraints...');
  assert.throws(() => {
    db.saveProjectSubmission({
      userId: alice.id,
      projectId,
      revision: rev1,
      assistanceMode: 'independent',
      repoUrl: 'javascript:alert(1)',
      textNotes: 'Malicious scheme'
    });
  }, /Invalid URL scheme/i);

  assert.throws(() => {
    db.saveProjectSubmission({
      userId: alice.id,
      projectId,
      revision: rev1,
      assistanceMode: 'independent',
      reportUrl: 'ftp://files.example.com/exploit',
      textNotes: 'FTP scheme rejected'
    });
  }, /Invalid URL scheme/i);

  // 6. Bounded constraints: text <= 4096 bytes
  console.log('6. Verifying bounded text constraints...');
  const oversizedText = 'A'.repeat(4097);
  assert.throws(() => {
    db.saveProjectSubmission({
      userId: alice.id,
      projectId,
      revision: rev1,
      assistanceMode: 'independent',
      repoUrl: 'https://github.com/alice/lab',
      textNotes: oversizedText
    });
  }, /exceeds maximum allowed length/i);

  // Verify existing record was NOT corrupted by rejected payload
  const unchanged = db.getProjectSubmission(alice.id, projectId);
  assert.equal(unchanged.repo_url, 'https://github.com/alice/ai-learning-lab-v2');

  // 7. Assistance mode validation
  console.log('7. Verifying assistance mode validation...');
  assert.throws(() => {
    db.saveProjectSubmission({
      userId: alice.id,
      projectId,
      revision: rev1,
      assistanceMode: 'unsupervised_magic',
      repoUrl: 'https://github.com/alice/lab'
    });
  }, /Invalid assistance mode/i);

  // 8. Evidence status separation: Pasted logs remain self-reported
  console.log('8. Verifying pasted logs cannot mint verified or reviewed evidence...');
  const pastedLogsSub = db.saveProjectSubmission({
    userId: bob.id,
    projectId,
    revision: rev1,
    assistanceMode: 'independent',
    repoUrl: 'https://github.com/bob/repo',
    textNotes: '=== TEST LOG: ALL 233 TESTS PASSED (100% VERIFIED) ==='
  });
  assert.equal(pastedLogsSub.evidence_status, 'self_reported');

  // 9. Content revision & stale summary
  console.log('9. Verifying content revision tracking and stale detection...');
  const summaryRev1 = db.getProjectMasterySummary(alice.id, projectId, rev1);
  assert.equal(summaryRev1.is_stale, false);
  assert.equal(summaryRev1.submission.id, sub1.id);
  assert.equal(summaryRev1.submission.evidence_status, 'self_reported');

  const summaryRev2 = db.getProjectMasterySummary(alice.id, projectId, rev2);
  assert.equal(summaryRev2.is_stale, true, 'Different revision must mark evidence as stale');

  console.log('>>> All Project Submission DB Unit Tests Passed! <<<');
}

runProjectSubmissionDbTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
