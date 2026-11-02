#!/usr/bin/env node
// scripts/validate_source_rights.cjs
// Enforces source resource provenance, rights gate, and redistribution limits.

const fs = require('node:fs');
const path = require('node:path');

const REUSE_CATEGORIES = [
  'linking',
  'quotation',
  'original_explanation',
  'imported_or_translated'
];

const PERMISSIVE_LICENSES = [
  'mit',
  'apache-2.0',
  'bsd-2-clause',
  'bsd-3-clause',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'psf license',
  'psf license version 2',
  'python software foundation license',
  'public domain',
  'cc0',
  'unlicense'
];

function isValidUrl(str) {
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Validates a single source resource against provenance completeness,
 * reuse categorization, rights gate rules, and compared candidates.
 */
function validateSource(source) {
  const errors = [];
  if (!source || typeof source !== 'object') {
    return { valid: false, errors: ['Source must be a non-null object'] };
  }

  const id = source.id || 'unidentified-source';

  // 1. Provenance Completeness
  const requiredFields = [
    'id',
    'title',
    'author',
    'original_url',
    'version_or_verification_date',
    'reuse_category',
    'license',
    'permission_basis',
    'selection_rationale',
    'prerequisites',
    'safe_fallback'
  ];

  for (const field of requiredFields) {
    if (!source[field] || typeof source[field] !== 'string' || !source[field].trim()) {
      errors.push(`Source '${id}': missing or empty required field '${field}'`);
    }
  }

  // First-party artifacts ('internal-project') are authored inside this
  // repository and therefore cannot name an external http(s) URL. For those,
  // 'original_url' must instead be a repository-relative path to the artifact;
  // validateCurriculumSources additionally verifies the path exists on disk,
  // which is a strictly stronger provenance check than a URL scheme test.
  // Third-party sources keep the mandatory http/https URL rule.
  if (source.source_type === 'internal-project') {
    if (!source.original_url || typeof source.original_url !== 'string' ||
        /^[a-z][a-z0-9+.-]*:/i.test(source.original_url) ||
        source.original_url.includes('..') || path.isAbsolute(source.original_url)) {
      errors.push(`Source '${id}': internal-project 'original_url' must be a repository-relative path without a URI scheme, got: ${source.original_url}`);
    }
  } else if (source.original_url && !isValidUrl(source.original_url)) {
    errors.push(`Source '${id}': 'original_url' must be a valid http/https URL, got: ${source.original_url}`);
  }

  // 2. Reuse Category Validation
  if (source.reuse_category && !REUSE_CATEGORIES.includes(source.reuse_category)) {
    errors.push(
      `Source '${id}': invalid 'reuse_category' '${source.reuse_category}'. Must be one of: ${REUSE_CATEGORIES.join(', ')}`
    );
  }

  // 3. Rights Gate: Imported or Translated Material
  if (source.reuse_category === 'imported_or_translated') {
    const licenseStr = (source.license || '').toLowerCase();
    const isPermissive = PERMISSIVE_LICENSES.some(p => licenseStr.includes(p));

    if (!isPermissive || licenseStr.includes('all rights reserved') || licenseStr.includes('unknown') || licenseStr.includes('standard youtube license')) {
      errors.push(
        `Source '${id}': 'imported_or_translated' reuse rejected by rights gate. Requires permissive redistribution license (e.g. MIT, Apache-2.0, CC-BY-4.0, CC-BY-SA-4.0, PSF), got '${source.license}'.`
      );
    }
  }

  // 4. Rights Gate: Unknown Subtitle Rights
  if (source.has_unknown_subtitle_rights || source.source_type === 'subtitles') {
    if (source.reuse_category === 'imported_or_translated') {
      errors.push(
        `Source '${id}': Unknown subtitle rights prevent full-text import or translation. Lawful external linking ('linking') or original explanation ('original_explanation') is permitted, but full-text import is rejected.`
      );
    }
  }

  // 5. Rights Gate: Software Repository License Generalization
  if (source.software_repository_license_only) {
    if (['video', 'dataset', 'subtitles'].includes(source.source_type) && source.reuse_category === 'imported_or_translated') {
      errors.push(
        `Source '${id}': Repository software license cannot be generalized to video, dataset, or subtitle redistribution without independent media authorization.`
      );
    }
  }

  // 6. License Restrictions: Noncommercial / Share-Alike Separation
  const licenseLower = (source.license || '').toLowerCase();
  const licenseTokens = licenseLower.split(/[^a-z]+/).filter(Boolean);
  const hasNc = licenseTokens.includes('nc') || licenseLower.includes('noncommercial') || licenseLower.includes('non-commercial');
  const hasSa = licenseTokens.includes('sa') || licenseLower.includes('share-alike') || licenseLower.includes('sharealike');

  const declaredRestrictions = Array.isArray(source.license_restrictions) ? source.license_restrictions : [];

  if (hasNc && !declaredRestrictions.includes('noncommercial')) {
    errors.push(
      `Source '${id}': License '${source.license}' contains noncommercial condition; 'license_restrictions' must explicitly include 'noncommercial' to separate it from original-content licensing.`
    );
  }
  if (hasSa && !declaredRestrictions.includes('share-alike')) {
    errors.push(
      `Source '${id}': License '${source.license}' contains share-alike condition; 'license_restrictions' must explicitly include 'share-alike' to separate it from original-content licensing.`
    );
  }

  // 7. Compared Candidates
  if (!Array.isArray(source.compared_candidates) || source.compared_candidates.length < 2) {
    errors.push(
      `Source '${id}': Must demonstrate real compared candidates (minimum 2 candidates required in 'compared_candidates').`
    );
  } else {
    source.compared_candidates.forEach((cand, idx) => {
      if (!cand.candidate_name || typeof cand.candidate_name !== 'string') {
        errors.push(`Source '${id}' candidate #${idx}: missing 'candidate_name'`);
      }
      if (!cand.url || !isValidUrl(cand.url)) {
        errors.push(`Source '${id}' candidate #${idx}: missing or invalid 'url'`);
      }
      if (!cand.license || typeof cand.license !== 'string') {
        errors.push(`Source '${id}' candidate #${idx}: missing 'license'`);
      }
      if (!cand.comparison_rationale || typeof cand.comparison_rationale !== 'string' || cand.comparison_rationale.length < 10) {
        errors.push(`Source '${id}' candidate #${idx}: missing or inadequate 'comparison_rationale'`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates a registry of sources.
 */
function validateRegistry(registry) {
  const errors = [];
  let sourceCount = 0;

  const sources = Array.isArray(registry) ? registry : Object.values(registry || {});
  for (const src of sources) {
    sourceCount++;
    const res = validateSource(src);
    if (!res.valid) {
      errors.push(...res.errors);
    }
  }

  return {
    valid: errors.length === 0,
    sourceCount,
    errors
  };
}

/**
 * Scans the curriculum tree for all defined sources in curriculum/sources/
 * and curriculum/days/*.json, and validates them all.
 */
function validateCurriculumSources(rootDir) {
  const errors = [];
  let totalSources = 0;

  // 1. Check sources registry if present
  const registryPath = path.join(rootDir, 'curriculum', 'sources', 'registry.json');
  const registeredSourcesMap = new Map();

  if (fs.existsSync(registryPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const regSources = Array.isArray(raw) ? raw : (raw.sources || Object.values(raw));
      for (const s of regSources) {
        registeredSourcesMap.set(s.id, s);
        totalSources++;
        const res = validateSource(s);
        if (!res.valid) {
          errors.push(...res.errors);
        }
      }
    } catch (err) {
      errors.push(`Failed to parse ${registryPath}: ${err.message}`);
    }
  }

  // 2. Check each day's activities in curriculum/days/
  const daysDir = path.join(rootDir, 'curriculum', 'days');
  if (fs.existsSync(daysDir)) {
    const dayFiles = fs.readdirSync(daysDir).filter(f => f.endsWith('.json'));
    for (const file of dayFiles) {
      const filePath = path.join(daysDir, file);
      try {
        const dayData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const activities = dayData.activities || [];
        for (const act of activities) {
          const sources = act.source_resources || [];
          for (const s of sources) {
            // Source can be a full object or a reference by ID resolved from registry
            let fullSource = s;
            if (s.id && registeredSourcesMap.has(s.id)) {
              fullSource = { ...registeredSourcesMap.get(s.id), ...s };
            }
            totalSources++;
            const res = validateSource(fullSource);
            // Internal artifacts must additionally point at a file that
            // actually exists in this repository.
            if (fullSource.source_type === 'internal-project' &&
                typeof fullSource.original_url === 'string' &&
                fullSource.original_url &&
                !/^[a-z][a-z0-9+.-]*:/i.test(fullSource.original_url)) {
              const rel = fullSource.original_url.split(' and ')[0].trim();
              if (!fs.existsSync(path.join(rootDir, rel))) {
                res.valid = false;
                res.errors.push(`Source '${fullSource.id || 'unidentified-source'}': internal-project 'original_url' does not resolve to a checked-in file: ${rel}`);
              }
            }
            if (!res.valid) {
              errors.push(`Day '${dayData.id}' Activity '${act.id}': ${res.errors.join('; ')}`);
            }
          }
        }
      } catch (err) {
        errors.push(`Failed parsing ${filePath}: ${err.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    sourceCount: totalSources,
    errors
  };
}

// CLI runner
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  console.log(`Running source rights audit from ${root}...`);
  const result = validateCurriculumSources(root);

  if (!result.valid) {
    console.error(`\n❌ Source Rights Audit FAILED with ${result.errors.length} error(s):`);
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log(`\n✅ Source Rights Audit PASSED: ${result.sourceCount} source(s) verified.`);
    process.exit(0);
  }
}

module.exports = {
  validateSource,
  validateRegistry,
  validateCurriculumSources,
  REUSE_CATEGORIES,
  PERMISSIVE_LICENSES
};
