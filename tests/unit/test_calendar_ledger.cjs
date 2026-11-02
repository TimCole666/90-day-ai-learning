// Unit test for Curriculum Calendar & Time Ledger
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(ROOT, 'curriculum', 'manifest.json');
const DAYS_DIR = path.join(ROOT, 'curriculum', 'days');

console.log('--- Running Calendar & Time Ledger Unit Tests ---');

// 1. Manifest file existence & structure
console.log('1. Checking manifest.json existence and schema...');
assert.ok(fs.existsSync(MANIFEST_PATH), 'curriculum/manifest.json must exist');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

assert.ok(manifest.version, 'Manifest must have a version string');
assert.strictEqual(manifest.total_days, 90, 'Manifest must declare exactly 90 total_days');
assert.strictEqual(manifest.total_active_minutes, 43200, 'Manifest must declare 43,200 total active minutes');

// 2. Category budget validation
console.log('2. Checking category budget accounting...');
const catMinutes = manifest.category_minutes;
assert.ok(catMinutes, 'Manifest must include category_minutes breakdown');
assert.strictEqual(catMinutes['self-directed-learning-and-python'], 10800, 'SDL & Python must equal 10,800 minutes (180h)');
assert.strictEqual(catMinutes['mathematics'], 8640, 'Mathematics must equal 8,640 minutes (144h)');
assert.strictEqual(catMinutes['models-and-training'], 17280, 'Models & Training must equal 17,280 minutes (288h)');
assert.strictEqual(catMinutes['agents'], 6480, 'Agents must equal 6,480 minutes (108h)');

const catSum = Object.values(catMinutes).reduce((a, b) => a + b, 0);
assert.strictEqual(catSum, 43200, 'Sum of category minutes must equal exactly 43,200 without double counting');

// 3. Days existence and daily active time validation
console.log('3. Validating all 90 Study Days and active time ledger...');
assert.ok(fs.existsSync(DAYS_DIR), 'curriculum/days/ directory must exist');

const dayFiles = fs.readdirSync(DAYS_DIR).filter(f => f.match(/^day-\d{2}\.json$/)).sort();
assert.strictEqual(dayFiles.length, 90, `Must have exactly 90 day-NN.json files, found ${dayFiles.length}`);

let calculatedTotalMinutes = 0;
const calculatedCatMinutes = {
  'self-directed-learning-and-python': 0,
  'mathematics': 0,
  'models-and-training': 0,
  'agents': 0
};

const activityIds = new Set();
const dayIds = new Set();
const adjacency = new Map(); // id -> prerequisites
const validStatuses = new Set(['planned', 'available', 'reviewed', 'accepted']);

let reviewDayCount = 0;

for (let i = 1; i <= 90; i++) {
  const dayId = `day-${String(i).padStart(2, '0')}`;
  const dayFile = path.join(DAYS_DIR, `${dayId}.json`);
  assert.ok(fs.existsSync(dayFile), `File for ${dayId} must exist`);

  const dayData = JSON.parse(fs.readFileSync(dayFile, 'utf8'));
  assert.strictEqual(dayData.id, dayId, `Day id in file must match filename: ${dayId}`);
  assert.strictEqual(dayData.day_number, i, `Day number must match sequence index ${i}`);
  assert.strictEqual(dayData.active_minutes, 480, `${dayId} must sum to exactly 480 active minutes`);
  assert.ok(validStatuses.has(dayData.status), `${dayId} status must be valid, got: ${dayData.status}`);

  // Status check: all 90 Study Days now ship complete four-edition content, so
  // every day must present an honest ready-state status; nothing may stay
  // 'planned' once its content exists.
  assert.ok(dayData.status === 'available' || dayData.status === 'accepted' || dayData.status === 'reviewed',
    `${dayId} must be available/reviewed/accepted now that its content exists`);

  if (dayData.is_review_day) {
    reviewDayCount++;
  }

  dayIds.add(dayId);
  adjacency.set(dayId, dayData.prerequisites || []);

  let dayActMinutesSum = 0;
  assert.ok(Array.isArray(dayData.activities) && dayData.activities.length > 0, `${dayId} must have activities`);

  for (const act of dayData.activities) {
    assert.ok(act.id, `Activity in ${dayId} must have an id`);
    assert.ok(!activityIds.has(act.id), `Duplicate activity ID detected: ${act.id}`);
    activityIds.add(act.id);

    assert.ok(typeof act.active_minutes === 'number' && act.active_minutes > 0, `Activity ${act.id} must have positive active_minutes`);
    dayActMinutesSum += act.active_minutes;

    const cat = act.category || dayData.topic_category;
    assert.ok(calculatedCatMinutes.hasOwnProperty(cat), `Unknown category: ${cat} in activity ${act.id}`);
    calculatedCatMinutes[cat] += act.active_minutes;

    assert.ok(validStatuses.has(act.status || dayData.status), `Activity ${act.id} status must be valid`);
  }

  assert.strictEqual(dayActMinutesSum, 480, `${dayId} activities must sum to exactly 480 active minutes, got ${dayActMinutesSum}`);
  calculatedTotalMinutes += dayActMinutesSum;
}

assert.strictEqual(calculatedTotalMinutes, 43200, `Sum of all day active minutes must equal 43,200, got ${calculatedTotalMinutes}`);

// Check activity-level category sum matches declared totals
for (const [cat, mins] of Object.entries(catMinutes)) {
  assert.strictEqual(calculatedCatMinutes[cat], mins, `Activity minutes for category '${cat}' must match manifest (${mins}), got ${calculatedCatMinutes[cat]}`);
}

// 4. Weekly lower-new-content review days
console.log('4. Checking weekly lower-new-content review day allocation...');
assert.ok(reviewDayCount >= 12, `Must include at least 12 weekly review days across 90 days, found ${reviewDayCount}`);

// 5. Lessons represented independently from Study Days
console.log('5. Checking independent Lessons representation...');
assert.ok(Array.isArray(manifest.lessons), 'Manifest must declare a distinct lessons list');
assert.ok(manifest.lessons.length > 0, 'Lessons list must not be empty');
for (const lesson of manifest.lessons) {
  assert.ok(lesson.id, 'Lesson must have an id');
  assert.ok(lesson.title, `Lesson ${lesson.id} must have a title`);
  assert.ok(validStatuses.has(lesson.status), `Lesson ${lesson.id} status must be valid`);
  assert.ok(Array.isArray(lesson.study_days), `Lesson ${lesson.id} must declare study_days`);
}

// 6. 3-day topic blocks aligned with Tickets 25 through 54
console.log('6. Checking 30 three-day topic packages aligned with tickets...');
assert.ok(Array.isArray(manifest.blocks), 'Manifest must declare blocks array');
assert.strictEqual(manifest.blocks.length, 30, 'Must have exactly 30 three-day topic blocks');
for (let b = 0; b < 30; b++) {
  const block = manifest.blocks[b];
  const startDay = b * 3 + 1;
  const endDay = b * 3 + 3;
  assert.strictEqual(block.block_number, b + 1, `Block index must match`);
  assert.strictEqual(block.start_day, startDay, `Block ${b + 1} must start on day ${startDay}`);
  assert.strictEqual(block.end_day, endDay, `Block ${b + 1} must end on day ${endDay}`);
  assert.ok(block.ticket_number >= 25 && block.ticket_number <= 54, `Block ${b + 1} must correspond to ticket 25..54`);
  assert.ok(block.title, `Block ${b + 1} must have a title`);
}

// 7. DAG Cycle & Dangling Reference Checks
console.log('7. Validating DAG structure (no cycles, no dangling references)...');

function validateDAG(nodes, adj) {
  // Check dangling references
  for (const [nodeId, prereqs] of adj.entries()) {
    for (const prereq of prereqs) {
      if (typeof prereq === 'string' && prereq.startsWith('day-')) {
        assert.ok(nodes.has(prereq), `Dangling reference: ${nodeId} depends on non-existent ${prereq}`);
      }
    }
  }

  // Kahn's algorithm for cycle detection
  const inDegree = new Map();
  for (const nodeId of nodes) {
    inDegree.set(nodeId, 0);
  }

  const outgoing = new Map();
  for (const nodeId of nodes) {
    outgoing.set(nodeId, []);
  }

  for (const [nodeId, prereqs] of adj.entries()) {
    for (const p of prereqs) {
      if (nodes.has(p)) {
        outgoing.get(p).push(nodeId);
        inDegree.set(nodeId, (inDegree.get(nodeId) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(nodeId);
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift();
    visitedCount++;
    for (const neighbor of outgoing.get(curr) || []) {
      const nextDeg = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) queue.push(neighbor);
    }
  }

  assert.strictEqual(visitedCount, nodes.size, `Cycle detected! Only ${visitedCount} of ${nodes.size} nodes resolved in topological order.`);
}

validateDAG(dayIds, adjacency);

// Negative test: verify cycle detection catches intentional cycle
const testNodes = new Set(['day-01', 'day-02', 'day-03']);
const cyclicAdj = new Map([
  ['day-01', ['day-03']],
  ['day-02', ['day-01']],
  ['day-03', ['day-02']]
]);
assert.throws(() => validateDAG(testNodes, cyclicAdj), /Cycle detected/, 'DAG validator must reject cyclic graphs');

// Negative test: verify dangling reference detection catches invalid prerequisite
const danglingAdj = new Map([
  ['day-01', []],
  ['day-02', ['day-999']]
]);
assert.throws(() => validateDAG(new Set(['day-01', 'day-02']), danglingAdj), /Dangling reference/, 'DAG validator must reject dangling references');

console.log('>>> ALL CALENDAR & TIME LEDGER UNIT TESTS PASSED! <<<');
