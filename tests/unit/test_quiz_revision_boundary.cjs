'use strict';

// OFFLINE source-block/call-boundary regression only. Never import server.cjs,
// lib/db.cjs, test_quiz_api.cjs, or any existing test. No server, network, DB,
// real identity/session, filesystem writes, environment changes, or children.
// This does NOT establish routing/authentication, real grading, DB filtering,
// grouping, retention, or any real historical attempt. All collaborators below
// are controlled stubs; only the extracted production branches execute.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const OLD_REVISION = '2026.10.30-rev1';
const CURRENT_REVISION = '2026.11.01-rev5';
// The other eleven fixtures did not change in the source-study pass.
const UNCHANGED_REVISION = '2026.10.31-rev1';
const USER = 'synthetic-boundary-user';
const MODES = ['independent', 'agent_assisted'];
const MARKERS = {
  submit: [
    '// Quiz API: POST /api/quiz/submit',
    '// Agent Track API: GET /api/users/:userId/track (Guessed identifier protection)'
  ],
  summary: [
    '// Quiz API: GET /api/quiz/attempts',
    '// Quiz API: GET /api/users/:userId/quiz-attempts (Guessed identifier protection)'
  ],
  history: [
    '// Quiz API: GET /api/users/:userId/quiz-attempts (Guessed identifier protection)',
    '// Project Submission API: POST /api/project/submit'
  ]
};
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.ok(start >= 0, `Missing start anchor: ${startMarker}`);
  assert.equal(source.lastIndexOf(startMarker), start, `Duplicate start anchor: ${startMarker}`);
  assert.ok(end >= 0, `Missing end anchor: ${endMarker}`);
  assert.equal(source.lastIndexOf(endMarker), end, `Duplicate end anchor: ${endMarker}`);
  assert.ok(end > start, 'End anchor must follow start anchor');
  return {
    code: source.slice(start, end),
    startLine: source.slice(0, start).split('\n').length,
    endLineExclusive: source.slice(0, end).split('\n').length
  };
}

// Read, never require, the three actual descriptors and original source.
const source = fs.readFileSync(path.join(ROOT, 'server.cjs'), 'utf8');
const blocks = Object.fromEntries(Object.entries(MARKERS).map(([name, markers]) => [
  name, extractBlock(source, ...markers)
]));
const programs = Object.fromEntries(Object.entries(blocks).map(([name, block]) => [
  name,
  new vm.Script(`'use strict';
  (async function ({ pathname, req, res, parsedUrl,
    getSessionFromReq, requireCsrf, readBodyJson, getActivityQuizDef, gradeQuiz, db }) {
${block.code}
    throw new Error('Extracted source block did not handle supplied fixture');
  })(__inputs)`, { filename: `quiz-source-block:${name}` })
]));
const descriptors = ['04', '05', '06'].map(day => {
  const relativePath = `curriculum/days/day-${day}.json`;
  const text = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  return { relativePath, sha256: sha256(text), data: JSON.parse(text) };
});
const fixtures = descriptors.flatMap(({ data }) => data.activities.map(activity => ({
  id: activity.id,
  content_revision: activity.content_revision,
  assistance_policy: activity.assistance_policy,
  quiz: activity.quiz
})));
const STUB_GRADE = { score: 83, passed: true, results: [{ synthetic_grade_result: true }] };

function submission(definition, assistanceMode, revision) {
  return {
    activity_id: definition.id,
    assistance_mode: assistanceMode,
    content_revision: revision,
    // These aliases are deliberately caller-controlled and must not be stored.
    revision: 'synthetic-caller-revision',
    contentRevision: 'synthetic-caller-camel-revision',
    answers: Object.fromEntries(definition.quiz.questions.map(q => [q.id, q.expected_answer]))
  };
}

async function invoke(name, {
  definition, body, activityId = definition ? definition.id : 'synthetic-missing-quiz',
  gradeResult = STUB_GRADE, summaryState = { synthetic_summary: true }, historyState = []
}) {
  const events = [];
  const calls = { definitions: [], grades: [], records: [], summaries: [], histories: [] };
  /** @type {{ heads: number, ends: number, status?: number,
   * headers?: { 'Content-Type': string }, body?: ReturnType<typeof JSON.parse> }} */
  const response = { heads: 0, ends: 0 };
  const req = Object.freeze({ method: name === 'submit' ? 'POST' : 'GET' });
  const inputs = {
    pathname: name === 'submit' ? '/api/quiz/submit'
      : name === 'summary' ? '/api/quiz/attempts' : `/api/users/${USER}/quiz-attempts`,
    req,
    res: {
      writeHead(status, headers) {
        response.heads++;
        response.status = status;
        response.headers = clone(headers);
      },
      end(text) {
        response.ends++;
        response.body = JSON.parse(text);
      }
    },
    parsedUrl: { searchParams: { get(key) {
      events.push('query');
      assert.equal(key, 'activityId');
      return activityId;
    } } },
    getSessionFromReq(request) {
      events.push('session');
      assert.equal(request, req);
      return { user_id: USER }; // Synthetic stub, not an authentication test.
    },
    // CSRF behavior is tested at the HTTP seam in test_platform_contracts.cjs.
    requireCsrf() { return true; },
    async readBodyJson(request) {
      events.push('body');
      assert.equal(request, req);
      return body;
    },
    getActivityQuizDef(...args) {
      events.push('definition');
      calls.definitions.push(args);
      return definition;
    },
    gradeQuiz(...args) {
      events.push('grade');
      calls.grades.push(args);
      return gradeResult; // No grading logic is copied or implemented.
    },
    db: Object.freeze({
      recordQuizAttempt(record) {
        events.push('record');
        calls.records.push(clone(record));
        return { id: 707, created_at: 'synthetic-created-at' };
      },
      getUserMasterySummary(...args) {
        events.push('summary');
        calls.summaries.push(args);
        return summaryState;
      },
      getQuizAttempts(...args) {
        events.push('history');
        calls.histories.push(args);
        return historyState;
      }
    })
  };
  const context = vm.createContext(Object.assign(Object.create(null), { __inputs: inputs }), {
    codeGeneration: { strings: false, wasm: false }
  });
  // No require/process bindings are supplied to the VM. This is not a security sandbox.
  const globals = new vm.Script('({ require: typeof require, process: typeof process })')
    .runInContext(context, { timeout: 1000 });
  assert.equal(globals.require, 'undefined');
  assert.equal(globals.process, 'undefined');
  await programs[name].runInContext(context, { timeout: 1000 });
  assert.equal(response.heads, 1, 'Exactly one response header call');
  assert.equal(response.ends, 1, 'Exactly one response body call');
  assert.deepEqual(response.headers, { 'Content-Type': 'application/json' });
  return { ...response, calls, events };
}

function rejected(result, status, code, currentRevision) {
  assert.equal(result.status, status);
  assert.equal(result.body.code, code);
  assert.equal(typeof result.body.error, 'string');
  if (currentRevision !== undefined) assert.equal(result.body.current_revision, currentRevision);
  else assert.equal(Object.hasOwn(result.body, 'current_revision'), false);
  assert.deepEqual(result.events, ['session', 'body', 'definition']);
  assert.deepEqual(result.calls.grades, []);
  assert.deepEqual(result.calls.records, []);
  assert.deepEqual(result.calls.summaries, []);
  assert.deepEqual(result.calls.histories, []);
}

function accepted(result, definition, body, grade = STUB_GRADE) {
  assert.equal(result.status, 200);
  assert.deepEqual(result.events, ['session', 'body', 'definition', 'grade', 'record']);
  assert.deepEqual(result.calls.definitions, [[definition.id]]);
  assert.equal(result.calls.grades.length, 1);
  assert.equal(result.calls.grades[0][0], definition.quiz, 'Grade the supplied current quiz');
  assert.equal(result.calls.grades[0][1], body.answers);
  assert.deepEqual(result.calls.records, [{
    userId: USER,
    activityId: definition.id,
    contentRevision: definition.content_revision,
    assistanceMode: body.assistance_mode,
    answers: body.answers,
    score: grade.score,
    passed: grade.passed ? 1 : 0
  }]);
  assert.deepEqual(result.body, {
    success: true, attempt_id: 707, score: grade.score, passed: grade.passed,
    assistance_mode: body.assistance_mode, content_revision: definition.content_revision,
    results: grade.results, created_at: 'synthetic-created-at'
  });
  assert.deepEqual(result.calls.summaries, []);
  assert.deepEqual(result.calls.histories, []);
}

let checks = 0;
async function check(label, fn) {
  await fn();
  console.log(`ok ${++checks} - source-block/call-boundary: ${label}`);
}

async function main() {
  console.log('# OFFLINE source-block/call-boundary regression; NOT whole-server or DB integration');
  console.log('# SOURCE_ANCHOR_HASHES ' + JSON.stringify({
    sourceSha256: sha256(source),
    blocks: Object.fromEntries(Object.entries(blocks).map(([name, block]) => [name, {
      startMarker: MARKERS[name][0], endMarker: MARKERS[name][1],
      startMarkerSha256: sha256(MARKERS[name][0]), endMarkerSha256: sha256(MARKERS[name][1]),
      startLine: block.startLine, endLineExclusive: block.endLineExclusive,
      sha256: sha256(block.code)
    }]))
  }));
  await check('extraction fails closed on missing, duplicate, or reversed anchors', () => {
    const valid = 'START\noriginal();\nEND';
    assert.equal(extractBlock(valid, 'START', 'END').code, 'START\noriginal();\n');
    for (const [text, message] of [
      ['original();\nEND', /Missing start/], ['START\noriginal();', /Missing end/],
      [`START\n${valid}`, /Duplicate start/], [`${valid}\nEND`, /Duplicate end/],
      ['END\nSTART', /End anchor must follow/]
    ]) assert.throws(() => extractBlock(text, 'START', 'END'), message);
  });
  await check('three current descriptors provide exactly twelve stable q1/key fixtures', () => {
    assert.equal(fixtures.length, 12);
    assert.equal(new Set(fixtures.map(f => f.id)).size, 12);
    for (const { data } of descriptors) {
      assert.equal(data.activities.length, 4);
      assert.ok(['day-04', 'day-05', 'day-06'].includes(data.id));
      assert.deepEqual(data.activities.map(a => a.id), [1, 2, 3, 4].map(n =>
        `${data.id}-act-${String(n).padStart(2, '0')}`));
    }
    for (const fixture of fixtures) {
      const expectedRevision = fixture.id === 'day-04-act-01'
        ? CURRENT_REVISION : UNCHANGED_REVISION;
      assert.equal(fixture.content_revision, expectedRevision);
      assert.equal(fixture.quiz.questions.length, 1);
      assert.equal(fixture.quiz.questions[0].id, `${fixture.id}-q1`);
      assert.equal(fixture.quiz.questions[0].type, 'choice');
      assert.equal(fixture.quiz.questions[0].expected_answer, 'a');
      assert.ok(MODES.includes(fixture.assistance_policy));
    }
    console.log('# DESCRIPTOR_FIXTURES ' + JSON.stringify({
      files: descriptors.map(({ relativePath, sha256: hash }) => ({ relativePath, sha256: hash })),
      quizzes: fixtures.map(f => ({ activity: f.id, revision: f.content_revision,
        questions: f.quiz.questions.map(q => ({ id: q.id, expected_answer: q.expected_answer })) }))
    }));
  });

  for (const mode of MODES) {
    await check(`${mode}: missing/non-string/blank token rejects before grade/write`, async () => {
      const fixture = fixtures[0];
      for (const token of [undefined, null, false, 0, 42, {}, [], '', ' ', '\t\r\n']) {
        const body = submission(fixture, mode, token);
        if (token === undefined) delete body.content_revision;
        const result = await invoke('submit', { definition: fixture, body });
        rejected(result, 400, 'content_revision_required');
        assert.deepEqual(result.calls.definitions, [[fixture.id]]);
      }
    });
    await check(`${mode}: unequal and space-padded tokens return exact current token without writes`, async () => {
      const fixture = fixtures[0];
      for (const token of [OLD_REVISION, 'synthetic-caller-revision',
        ` ${CURRENT_REVISION}`, `${CURRENT_REVISION} `, `\t${CURRENT_REVISION}\n`]) {
        const result = await invoke('submit', {
          definition: fixture, body: submission(fixture, mode, token)
        });
        rejected(result, 409, 'stale_content_revision', fixture.content_revision);
      }
    });
  }

  for (const fixture of fixtures) {
    await check(`${fixture.id}: old token rejected and new token accepted in both assistance modes`, async () => {
      const snapshot = clone(fixture);
      // Controlled prior-token state, NOT an old descriptor or historical DB attempt.
      const priorDefinition = { ...clone(fixture), content_revision: OLD_REVISION };
      assert.deepEqual(priorDefinition.quiz, fixture.quiz, 'Token-only cutover keeps q1/key unchanged');
      for (const mode of MODES) {
        const oldPage = submission(fixture, mode, OLD_REVISION);
        accepted(await invoke('submit', { definition: priorDefinition, body: oldPage }), priorDefinition, oldPage);
        rejected(await invoke('submit', { definition: fixture, body: oldPage }),
          409, 'stale_content_revision', fixture.content_revision);
        const newPage = submission(fixture, mode, fixture.content_revision);
        accepted(await invoke('submit', { definition: fixture, body: newPage }), fixture, newPage);
      }
      assert.deepEqual(fixture, snapshot, 'Controlled calls do not mutate descriptor fixtures');
    });
  }
  await check('stubbed failing grade is forwarded once, including passed=0 storage conversion', async () => {
    const fixture = fixtures[0];
    const body = submission(fixture, 'independent', fixture.content_revision);
    const grade = { score: 17, passed: false, results: [{ synthetic_failure: true }] };
    accepted(await invoke('submit', { definition: fixture, body, gradeResult: grade }), fixture, body, grade);
  });
  for (const mode of MODES) {
    await check(`${mode}: synthetic unchanged-token assessed-text collision remains undetected (not historical proof)`, async () => {
      const before = clone(fixtures[0]);
      before.quiz.questions[0].prompt = 'Synthetic assessed text A; not historical lesson prose.';
      const after = clone(before);
      after.quiz.questions[0].prompt = 'Synthetic assessed text B; deliberately reused token.';
      assert.notEqual(before.quiz.questions[0].prompt, after.quiz.questions[0].prompt);
      assert.equal(before.content_revision, after.content_revision);
      assert.equal(before.quiz.questions[0].id, after.quiz.questions[0].id);
      assert.equal(before.quiz.questions[0].expected_answer, after.quiz.questions[0].expected_answer);
      const unchangedPage = submission(before, mode, before.content_revision);
      accepted(await invoke('submit', { definition: before, body: unchangedPage }), before, unchangedPage);
      accepted(await invoke('submit', { definition: after, body: unchangedPage }), after, unchangedPage);
    });
  }
  await check('summary forwards exact user/activity/current-token triple for all twelve fixtures (stub only)', async () => {
    for (const fixture of fixtures) {
      const summaryState = { synthetic_summary: fixture.id };
      const result = await invoke('summary', { definition: fixture, summaryState });
      assert.equal(result.status, 200);
      assert.deepEqual(result.events, ['session', 'query', 'definition', 'summary']);
      assert.deepEqual(result.calls.definitions, [[fixture.id]]);
      assert.deepEqual(result.calls.summaries, [[USER, fixture.id, fixture.content_revision]]);
      assert.deepEqual(result.body, { activity_id: fixture.id, current_revision: fixture.content_revision, summary: summaryState });
      assert.deepEqual(result.calls.records, []);
      assert.deepEqual(result.calls.grades, []);
      assert.deepEqual(result.calls.histories, []);
    }
  });
  await check('summary forwards null for missing quizDef without grade/write (stub only)', async () => {
    const result = await invoke('summary', { definition: null });
    assert.equal(result.status, 200);
    assert.deepEqual(result.events, ['session', 'query', 'definition', 'summary']);
    assert.deepEqual(result.calls.definitions, [['synthetic-missing-quiz']]);
    assert.deepEqual(result.calls.summaries, [[USER, 'synthetic-missing-quiz', null]]);
    assert.deepEqual(result.body, {
      activity_id: 'synthetic-missing-quiz', current_revision: null, summary: { synthetic_summary: true }
    });
    assert.deepEqual(result.calls.records, []);
    assert.deepEqual(result.calls.grades, []);
    assert.deepEqual(result.calls.histories, []);
  });
  await check('history forwards getQuizAttempts(user) with no revision filter or writes (NOT DB retention)', async () => {
    const historyState = [
      { id: 'synthetic-old', content_revision: OLD_REVISION, assistance_mode: 'independent' },
      { id: 'synthetic-new', content_revision: CURRENT_REVISION, assistance_mode: 'agent_assisted' }
    ];
    const snapshot = clone(historyState);
    const result = await invoke('history', { definition: fixtures[0], historyState });
    assert.equal(result.status, 200);
    assert.deepEqual(result.events, ['session', 'history']);
    assert.deepEqual(result.calls.histories, [[USER]], 'Exactly one argument; no revision filtering at this boundary');
    assert.deepEqual(result.body, { user_id: USER, attempts: snapshot });
    assert.deepEqual(historyState, snapshot, 'Injected array remains untouched; NOT real DB retention proof');
    assert.deepEqual(result.calls.records, []);
    assert.deepEqual(result.calls.grades, []);
    assert.deepEqual(result.calls.definitions, []);
    assert.deepEqual(result.calls.summaries, []);
  });
  console.log(`# PASS ${checks} source-block/call-boundary checks; real DB filtering/retention unverified`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1; // Host only; never supplied to the VM.
});
