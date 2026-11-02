// Candidate-level structural regression for the complete 90-day four-language
// Curriculum (ticket 55). Checks whole-candidate invariants that per-block
// suites do not aggregate: exact 90-day/720-hour ledger, globally unique
// activity identities, lesson<->activity<->manifest references, prerequisite
// resolution, four-edition parity, quiz parity, source-resource field
// completeness, and per-day review-record coverage.
// These are structure claims only; they do not certify substantive review,
// live OAuth, paid tool runs, cloud training, or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const languages = ['en', 'ja', 'zh-Hans', 'zh-Hant'];
const requiredFields = ['title', 'objective', 'instructions', 'exercise_prompt', 'hint', 'answer', 'mastery_criterion'];
const sourceFields = ['id', 'title', 'author', 'original_url', 'version_or_verification_date', 'reuse_category', 'license', 'permission_basis', 'selection_rationale', 'safe_fallback'];
const VALID_ACTIVITY_TYPES = new Set(['lesson', 'review', 'practice', 'assessment', 'project', 'setup']);
const VALID_ASSISTANCE = new Set(['independent', 'independent_mastery', 'agent_assisted']);
const VALID_STATUS = new Set(['planned', 'available', 'reviewed', 'accepted']);
const VALID_REUSE = new Set(['linking', 'quotation', 'original_explanation', 'imported_or_translated']);
const EXPECTED_PLANNED = new Set(); // all 90 days ship complete four-edition content; no day may remain 'planned'.
// Day -> review record coverage for all 90 Study Days (mirrors audit REVIEW_RECORDS).
const REVIEW_COVERAGE = [
  ['study-days-01-03.md', [1, 3]], ['study-days-04-06.md', [4, 6]],
  ['study-days-07-09.md', [7, 9]], ['study-days-10-12.md', [10, 12]],
  ['study-days-13-15.md', [13, 15]], ['functions-limits-days-16-18.md', [16, 18]],
  ['study-days-19-21.md', [19, 21]], ['study-days-22-24.md', [22, 24]],
  ['study-days-25-27.md', [25, 27]], ['study-days-28-30.md', [28, 30]],
  ['autograd-days-31-33.md', [31, 33]], ['study-days-34-36.md', [34, 36]],
  ['study-days-37-39.md', [37, 39]], ['study-days-40-42.md', [40, 42]],
  ['study-days-43-45.md', [43, 45]], ['study-days-46-48.md', [46, 48]],
  ['study-days-49-51.md', [49, 51]], ['study-days-52-54.md', [52, 54]],
  ['study-days-55-57.md', [55, 57]], ['study-days-58-60.md', [58, 60]],
  ['study-days-61-63.md', [61, 63]], ['study-days-64-66.md', [64, 66]],
  ['study-days-67-69.md', [67, 69]], ['study-days-70-72.md', [70, 72]],
  ['study-days-73-75.md', [73, 75]], ['study-days-76-78.md', [76, 78]],
  ['study-days-79-81.md', [79, 81]], ['study-days-82-84.md', [82, 84]],
  ['study-days-85-87.md', [85, 87]], ['study-days-88-90.md', [88, 90]],
];
const dayId = n => `day-${String(n).padStart(2, '0')}`;
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts)));

// 1. Manifest totals and lesson registry.
const manifest = readJson('curriculum', 'manifest.json');
assert.equal(manifest.total_days, 90);
assert.equal(manifest.total_active_minutes, 43200);
assert.equal(manifest.total_hours, 720);
assert.equal(manifest.hours_per_day, 8);
assert.equal(manifest.minutes_per_day, 480);
assert.deepEqual(manifest.category_minutes, {
  'self-directed-learning-and-python': 10800,
  'mathematics': 8640,
  'models-and-training': 17280,
  'agents': 6480,
});
assert.equal(manifest.lessons.length, 90, 'manifest must register one lesson slot per Study Day');
const lessonById = new Map(manifest.lessons.map(lesson => [lesson.id, lesson]));

// 2. Day ledgers: 480-minute accounting, identity uniqueness, status discipline, DAG.
const allActivityIds = new Set();
const categoryMinutes = {};
let totalMinutes = 0;
const plannedDays = [];
for (let n = 1; n <= 90; n++) {
  const id = dayId(n);
  const day = readJson('curriculum', 'days', `${id}.json`);
  assert.equal(day.id, id);
  assert.equal(day.day_number, n);
  assert.equal(day.active_minutes, 480, `${id} must declare 480 active minutes`);
  const sum = day.activities.reduce((acc, activity) => acc + activity.active_minutes, 0);
  assert.equal(sum, 480, `${id} activities must sum to 480 minutes (optional work cannot inflate the ledger)`);
  totalMinutes += sum;
  assert.ok(VALID_STATUS.has(day.status), `${id} invalid status ${day.status}`);
  if (day.status === 'planned') plannedDays.push(id);
  for (const activity of day.activities) {
    assert.ok(!allActivityIds.has(activity.id), `activity id ${activity.id} reused: work would be double-counted`);
    allActivityIds.add(activity.id);
    assert.equal(activity.status, day.status, `${activity.id} status must match its day`);
    assert.ok(VALID_ACTIVITY_TYPES.has(activity.activity_type), `${activity.id} bad type`);
    assert.ok(VALID_ASSISTANCE.has(activity.assistance_policy), `${activity.id} bad assistance policy`);
    assert.ok(manifest.category_minutes[activity.category] !== undefined, `${activity.id} bad category`);
    categoryMinutes[activity.category] = (categoryMinutes[activity.category] || 0) + activity.active_minutes;
    assert.ok(lessonById.has(activity.lesson_id), `${activity.id} references unknown lesson ${activity.lesson_id}`);
    // Every present source must be well-formed. Per-activity source counts are
    // reported in the candidate regression report, not gated here: early blocks
    // (days 01, 07-15, 31-33) predate the >=2-source convention used by later
    // blocks and are listed as a candidate finding there.
    for (const source of activity.source_resources) {
      for (const field of sourceFields) assert.ok(source[field], `${activity.id} source ${source.id || '?'} missing ${field}`);
      assert.ok(VALID_REUSE.has(source.reuse_category), `${source.id} invalid reuse_category`);
    }
    for (const prereq of activity.prerequisites || []) {
      if (typeof prereq === 'string' && /^day-\d{2}$/.test(prereq)) {
        assert.ok(fs.existsSync(path.join(ROOT, 'curriculum', 'days', `${prereq}.json`)), `${activity.id} dangling prerequisite ${prereq}`);
      }
    }
  }
  // Day prerequisites may mix free-text entry requirements with day-NN refs;
  // only the structural refs must resolve, and they must point backwards (DAG).
  for (const prereq of day.prerequisites || []) {
    if (typeof prereq === 'string' && /^day-\d{2}$/.test(prereq)) {
      const file = path.join(ROOT, 'curriculum', 'days', `${prereq}.json`);
      assert.ok(fs.existsSync(file), `${id} dangling prerequisite ${prereq}`);
      assert.ok(readJson('curriculum', 'days', `${prereq}.json`).day_number < n, `${id} prerequisite ${prereq} must point to an earlier day (cycle)`);
    }
  }
  for (const link of day.recovery_links || []) {
    if (typeof link === 'string' && /^day-\d{2}$/.test(link)) {
      assert.ok(fs.existsSync(path.join(ROOT, 'curriculum', 'days', `${link}.json`)), `${id} dangling recovery link ${link}`);
    }
  }
}
assert.equal(totalMinutes, 43200, 'candidate must total 43,200 active minutes / 720 hours');
assert.equal(allActivityIds.size, 360, 'candidate should hold exactly 360 unique required activities');
assert.deepEqual(categoryMinutes, manifest.category_minutes, 'activity minutes must reconcile to the manifest category budget');
assert.deepEqual(plannedDays.sort(), [...EXPECTED_PLANNED].sort(), 'no day may remain planned once its four-edition content ships');

// 3. Lesson<->day consistency.
const lessonDayRefs = new Map();
for (let n = 1; n <= 90; n++) {
  const day = readJson('curriculum', 'days', `${dayId(n)}.json`);
  for (const activity of day.activities) {
    if (!lessonDayRefs.has(activity.lesson_id)) lessonDayRefs.set(activity.lesson_id, new Set());
    lessonDayRefs.get(activity.lesson_id).add(day.id);
  }
}
for (const lesson of manifest.lessons) {
  assert.ok(lessonDayRefs.has(lesson.id), `manifest lesson ${lesson.id} has no activities`);
  for (const studyDay of lesson.study_days) {
    assert.ok(lessonDayRefs.get(lesson.id).has(studyDay), `${lesson.id} claims ${studyDay} but no activity there references it`);
  }
  const dayStatuses = new Set([...lessonDayRefs.get(lesson.id)].map(d => readJson('curriculum', 'days', `${d}.json`).status));
  assert.ok(dayStatuses.has(lesson.status) || (dayStatuses.size === 1 && dayStatuses.has(lesson.status)),
    `${lesson.id} status ${lesson.status} inconsistent with its days ${[...dayStatuses]}`);
}

// 4. Four Language Editions: parity of identity, required fields, and quiz shape.
const fieldGaps = [];
const quizGaps = [];
for (let n = 1; n <= 90; n++) {
  const id = dayId(n);
  const day = readJson('curriculum', 'days', `${id}.json`);
  const expectedIds = day.activities.map(activity => activity.id).sort();
  for (const lang of languages) {
    const file = path.join(ROOT, 'curriculum', 'content', id, `${lang}.json`);
    assert.ok(fs.existsSync(file), `missing ${lang} edition for ${id}`);
    const content = readJson('curriculum', 'content', id, `${lang}.json`);
    assert.equal(content.language, lang, `${id}/${lang} language tag mismatch`);
    assert.ok(content.language_label && content.day_title, `${id}/${lang} missing labels`);
    assert.deepEqual(Object.keys(content.activities).sort(), expectedIds, `${id}/${lang} activity identity mismatch`);
    for (const [actId, activity] of Object.entries(content.activities)) {
      for (const field of requiredFields) {
        if (!activity[field]) fieldGaps.push(`${id}/${lang}/${actId} missing ${field}`);
      }
      const ledgerQuiz = day.activities.find(a => a.id === actId)?.quiz;
      if (ledgerQuiz) {
        if (!activity.quiz) {
          quizGaps.push(`${id}/${lang}/${actId} missing quiz present in ledger`);
        } else {
          if (activity.quiz.questions.length !== ledgerQuiz.questions.length) quizGaps.push(`${id}/${lang}/${actId} quiz length mismatch`);
          else if (JSON.stringify(activity.quiz.questions.map(q => q.id)) !== JSON.stringify(ledgerQuiz.questions.map(q => q.id))) quizGaps.push(`${id}/${lang}/${actId} quiz id mismatch`);
        }
      }
    }
  }
}
assert.deepEqual(fieldGaps, [], `required-field gaps across editions:\n${fieldGaps.join('\n')}`);
// The quiz-parity assert runs at the end of the file (after all other checks)
// so a known-failed claim cannot hide whether later invariants still hold.

// 5. Shared non-day pages exist in all four editions. Schemas differ by page
// (agent-track carries language tags; calendar/diagnostics rely on the route),
// so existence plus a title field is the checked invariant.
for (const page of ['agent-track', 'calendar', 'diagnostics']) {
  for (const lang of languages) {
    const file = path.join(ROOT, 'curriculum', 'content', page, `${lang}.json`);
    assert.ok(fs.existsSync(file), `missing ${lang} edition for shared page ${page}`);
    const pageContent = readJson('curriculum', 'content', page, `${lang}.json`);
    assert.ok(pageContent.page_title || pageContent.title, `${page}/${lang} missing title`);
  }
}

// 6. All four Agent Tool Tracks registered with honest verification state fields.
const trackRegistry = readJson('curriculum', 'agent-tracks', 'registry.json');
assert.deepEqual(trackRegistry.tracks.map(t => t.id).sort(), ['claude-code', 'codex', 'deepseek-harness', 'pi-agent']);
for (const track of trackRegistry.tracks) {
  for (const field of ['name', 'tested_version', 'verification_state', 'verification_date', 'access_prerequisites', 'cost_assumptions', 'execution_boundary']) {
    assert.ok(track[field], `track ${track.id} missing ${field}`);
  }
  assert.notEqual(track.verification_state, 'verified', `track ${track.id} must not claim live verification without authorized runs`);
}

// 7. Per-day review records cover the entire candidate; none replaced by this pass.
const coveredDays = new Set();
for (const [file, [start, end]] of REVIEW_COVERAGE) {
  const full = path.join(ROOT, 'curriculum', 'reviews', file);
  assert.ok(fs.existsSync(full), `missing review record ${file}`);
  assert.ok(fs.statSync(full).size > 1000, `review record ${file} is implausibly small`);
  for (let n = start; n <= end; n++) {
    assert.ok(!coveredDays.has(n), `day ${n} covered by two review records`);
    coveredDays.add(n);
  }
}
assert.equal(coveredDays.size, 90, 'review records must cover all 90 Study Days');

// 8. Strict quiz parity, asserted last. Known failed claim at candidate time:
// day-35-act-04 and day-36-act-04 quizzes exist in en but not in
// ja/zh-Hans/zh-Hant. Kept strict so the suite keeps recording the defect
// until a content ticket repairs it; see curriculum/reviews/candidate-regression.md.
assert.deepEqual(quizGaps, [], `quiz parity gaps across editions:\n${quizGaps.join('\n')}`);

console.log('Candidate regression structural checks passed (90 days, 43,200 min, 4 editions, 4 tracks, 30 review records)');
