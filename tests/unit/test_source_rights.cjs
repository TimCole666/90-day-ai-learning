// tests/unit/test_source_rights.cjs
// Unit test suite for Source Resource Rights Gate and Provenance Validation
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// We will require the validator module from scripts/validate_source_rights.cjs
const {
  validateSource,
  validateRegistry,
  validateCurriculumSources,
  REUSE_CATEGORIES
} = require('../../scripts/validate_source_rights.cjs');

console.log('--- Running Source Rights & Provenance Unit Tests ---');

// 1. Fixture: A fully compliant, valid source
const validSource = {
  id: 'py-docs-datamodel',
  title: 'Python Data Model & Mutability Reference',
  author: 'Python Software Foundation',
  original_url: 'https://docs.python.org/3/reference/datamodel.html',
  relevant_timestamp: 'Section 3.1 & 3.2 (Objects, values, types)',
  version_or_verification_date: 'Python 3.12 (Verified: 2026-10-30)',
  reuse_category: 'linking',
  source_type: 'documentation',
  license: 'PSF License Version 2',
  license_restrictions: [],
  permission_basis: 'Lawful external reference under PSF open documentation terms; no proprietary content imported.',
  prerequisites: 'Basic command line and high school reading comprehension',
  selection_rationale: 'Definitive normative authority on Python identity vs value semantics and mutable vs immutable types without tutorial inaccuracies.',
  known_availability_limitations: 'Standard documentation hosted on python.org; accessible worldwide with offline standard library documentation bundle as local fallback.',
  safe_fallback: 'Official documentation is mirrored locally via standard library pydoc and embedded offline lesson explanations if internet access is interrupted.',
  compared_candidates: [
    {
      candidate_name: 'MIT OCW 6.0001 (Prof. Eric Grimson)',
      url: 'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/',
      license: 'CC BY-NC-SA 4.0',
      status: 'compared_rejected_for_day01',
      comparison_rationale: 'High pedagogical clarity for Python fundamentals, but structures mutability around academic lecture pacing rather than immediate hands-on minimal reproductions (MRE).'
    },
    {
      candidate_name: 'Stanford CS336: Language Modeling from Scratch (Spring 2024)',
      url: 'https://github.com/stanford-cs336/spring2024-assignment1-basics',
      license: 'MIT (Code) / All Rights Reserved (Lectures)',
      status: 'compared_deferred',
      comparison_rationale: 'Outstanding systems engineering and PyTorch tensor rigor, but assumes advanced Python mastery and PyTorch installed; deferred to Days 30-60 model pretraining.'
    }
  ]
};

// Test 1: Compliant source passes
{
  const result = validateSource(validSource);
  assert.strictEqual(result.valid, true, `Expected valid source to pass, got errors: ${result.errors.join('; ')}`);
  assert.strictEqual(result.errors.length, 0);
  console.log('✓ Valid compliant source passes validation');
}

// Test 2: Reject missing provenance fields
{
  const missingAuthor = { ...validSource, author: '' };
  const res1 = validateSource(missingAuthor);
  assert.strictEqual(res1.valid, false);
  assert(res1.errors.some(e => e.includes('author')), 'Should flag missing author');

  const missingUrl = { ...validSource, original_url: 'invalid-url' };
  const res2 = validateSource(missingUrl);
  assert.strictEqual(res2.valid, false);
  assert(res2.errors.some(e => e.includes('original_url')), 'Should flag invalid URL');

  const missingVerification = { ...validSource, version_or_verification_date: '' };
  const res3 = validateSource(missingVerification);
  assert.strictEqual(res3.valid, false);
  assert(res3.errors.some(e => e.includes('version_or_verification_date')), 'Should flag missing verification date');

  const missingRationale = { ...validSource, selection_rationale: '' };
  const res4 = validateSource(missingRationale);
  assert.strictEqual(res4.valid, false);
  assert(res4.errors.some(e => e.includes('selection_rationale')), 'Should flag missing selection rationale');

  const missingPrereqs = { ...validSource, prerequisites: '' };
  const res5 = validateSource(missingPrereqs);
  assert.strictEqual(res5.valid, false);
  assert(res5.errors.some(e => e.includes('prerequisites')), 'Should flag missing prerequisites');

  const missingFallback = { ...validSource, safe_fallback: '' };
  const res6 = validateSource(missingFallback);
  assert.strictEqual(res6.valid, false);
  assert(res6.errors.some(e => e.includes('safe_fallback')), 'Should flag missing safe fallback');

  console.log('✓ Rejects missing provenance, invalid URLs, and missing rationales');
}

// Test 3: Reject invalid reuse categories
{
  const invalidCategory = { ...validSource, reuse_category: 'mirroring_without_license' };
  const res = validateSource(invalidCategory);
  assert.strictEqual(res.valid, false);
  assert(res.errors.some(e => e.includes('reuse_category')), 'Should reject unknown reuse category');
  console.log('✓ Rejects invalid reuse category; allows only linking, quotation, original_explanation, imported_or_translated');
}

// Test 4: Rights gate: reject full-text import without permissive redistribution license
{
  const proprietaryImport = {
    ...validSource,
    reuse_category: 'imported_or_translated',
    license: 'All Rights Reserved',
    permission_basis: 'Pasted from website'
  };
  const res = validateSource(proprietaryImport);
  assert.strictEqual(res.valid, false);
  assert(res.errors.some(e => e.includes('redistribution') || e.includes('license')),
    'Should reject imported_or_translated with All Rights Reserved license');

  const unknownLicenseImport = {
    ...validSource,
    reuse_category: 'imported_or_translated',
    license: 'Unknown',
    permission_basis: 'Found online'
  };
  const resUnknown = validateSource(unknownLicenseImport);
  assert.strictEqual(resUnknown.valid, false);
  console.log('✓ Rights gate: rejects imported_or_translated under proprietary or unknown licenses');
}

// Test 5: Rights gate: unknown subtitle rights prevent full-text import
{
  const videoWithUnknownSubtitles = {
    ...validSource,
    title: 'Karpathy Zero to Hero Lecture',
    source_type: 'subtitles',
    reuse_category: 'imported_or_translated',
    license: 'Standard YouTube License',
    has_unknown_subtitle_rights: true,
    permission_basis: 'Extracted subtitles from YouTube'
  };
  const res = validateSource(videoWithUnknownSubtitles);
  assert.strictEqual(res.valid, false);
  assert(res.errors.some(e => e.toLowerCase().includes('subtitle')),
    'Should explicitly reject full-text import of unknown subtitle rights');

  // But lawful external linking to the video is allowed
  const videoLinkOnly = {
    ...validSource,
    title: 'Karpathy Zero to Hero Lecture',
    source_type: 'video',
    reuse_category: 'linking',
    license: 'Standard YouTube License',
    has_unknown_subtitle_rights: true,
    permission_basis: 'Lawful external link to official YouTube publication; no audio/video/subtitles imported.'
  };
  const resLink = validateSource(videoLinkOnly);
  assert.strictEqual(resLink.valid, true, `External link to YouTube video should be allowed, got: ${resLink.errors.join('; ')}`);
  console.log('✓ Rights gate: unknown subtitle rights block full-text import while allowing lawful external linking');
}

// Test 6: Rights gate: repository software licenses are not generalized to videos, datasets, or subtitles
{
  const generalizedRepoLicense = {
    ...validSource,
    title: 'CS336 Lecture Video 01',
    source_type: 'video',
    reuse_category: 'imported_or_translated',
    license: 'MIT',
    software_repository_license_only: true,
    permission_basis: 'The code repository is MIT, so we imported the lecture video'
  };
  const res = validateSource(generalizedRepoLicense);
  assert.strictEqual(res.valid, false);
  assert(res.errors.some(e => e.includes('generalize') || e.includes('software')),
    'Should reject generalizing repository software license to video/dataset/subtitles');
  console.log('✓ Rights gate: prevents generalizing repository software license to video/dataset/subtitles');
}

// Test 7: Noncommercial and share-alike restrictions preserved separately from original licensing
{
  const ncSaSource = {
    ...validSource,
    title: 'MIT OCW Lecture Notes',
    license: 'CC BY-NC-SA 4.0',
    license_restrictions: [] // Missing declaration of NC / SA
  };
  const res = validateSource(ncSaSource);
  assert.strictEqual(res.valid, false);
  assert(res.errors.some(e => e.includes('noncommercial') || e.includes('share-alike') || e.includes('restrictions')),
    'Should require explicit declaration of noncommercial / share-alike conditions');

  // Correctly declared restrictions
  const declaredNcSa = {
    ...validSource,
    title: 'MIT OCW Lecture Notes',
    license: 'CC BY-NC-SA 4.0',
    license_restrictions: ['noncommercial', 'share-alike']
  };
  const resDeclared = validateSource(declaredNcSa);
  assert.strictEqual(resDeclared.valid, true);
  console.log('✓ Preserves source-specific noncommercial and share-alike restrictions separately');
}

// Test 7b: License substring coincidences must not force NC/SA declarations
{
  // 'nc' inside "reference" and 'sa' inside "usage" are not license conditions.
  const linkedReference = {
    ...validSource,
    title: 'Vendor Tool Usage Documentation',
    license: 'Vendor copyright (no open license stated) / linked reference',
    license_restrictions: ['Linking only; no documentation text is copied']
  };
  const resLinked = validateSource(linkedReference);
  assert.strictEqual(resLinked.valid, true,
    `Linked-reference wording must not trigger a noncommercial declaration: ${resLinked.errors.join('; ')}`);

  const usageNotes = {
    ...validSource,
    title: 'Usage Notes Companion',
    license: 'Vendor site terms; see also usage notes and disclosures',
    license_restrictions: []
  };
  const resUsage = validateSource(usageNotes);
  assert.strictEqual(resUsage.valid, true,
    `Substrings inside ordinary words must not trigger a share-alike declaration: ${resUsage.errors.join('; ')}`);

  // Real NC/SA tokens still require declarations even inside longer text.
  const ncUndeclared = {
    ...validSource,
    license: 'Portions under CC BY-NC 4.0 (anthology, pre-2016 material)',
    license_restrictions: []
  };
  const resNc = validateSource(ncUndeclared);
  assert(resNc.errors.some(e => e.includes('noncommercial')),
    'Real NC tokens must still require a noncommercial declaration');

  const saUndeclared = {
    ...validSource,
    license: 'Apache-2.0 AND CC-BY-SA-4.0',
    license_restrictions: []
  };
  const resSa = validateSource(saUndeclared);
  assert(resSa.errors.some(e => e.includes('share-alike')),
    'Real SA tokens must still require a share-alike declaration');
  console.log('✓ License condition detection matches whole tokens, not substrings inside other words');
}

// Test 8: Compared candidates requirement
{
  const noCandidates = { ...validSource, compared_candidates: [] };
  const res1 = validateSource(noCandidates);
  assert.strictEqual(res1.valid, false);
  assert(res1.errors.some(e => e.includes('compared_candidates')),
    'Should require compared candidates');

  const missingCandidateDetails = {
    ...validSource,
    compared_candidates: [
      { candidate_name: 'CS336' } // missing url, license, comparison_rationale
    ]
  };
  const res2 = validateSource(missingCandidateDetails);
  assert.strictEqual(res2.valid, false);
  console.log('✓ Validates real compared candidates requirement');
}

// Test 9: Validate actual curriculum files and registry
{
  const projectRoot = path.resolve(__dirname, '../..');
  const curriculumResult = validateCurriculumSources(projectRoot);
  assert.strictEqual(curriculumResult.valid, true,
    `Curriculum source validation failed: ${curriculumResult.errors.join('\n')}`);
  console.log(`✓ Curriculum source validation passed for ${curriculumResult.sourceCount} registered sources across published units!`);
}

console.log('\n>>> ALL SOURCE RIGHTS UNIT TESTS PASSED SUCCESSFULLY! <<<\n');
