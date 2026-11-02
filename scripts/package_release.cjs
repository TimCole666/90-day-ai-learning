#!/usr/bin/env node
// Packaging script for 90-Day AI Learning Platform reproducible release artifact
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const { assertSupportedNodeVersion } = require('../lib/runtime.cjs');
const { readConfigFile } = require('../lib/database-maintenance.cjs');

assertSupportedNodeVersion();

const ROOT = path.resolve(process.env.PACKAGE_ROOT || path.join(__dirname, '..'));
const { validateCurriculumSources } = require('./validate_source_rights.cjs');

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function collectFiles(baseDir, relativePrefix = '') {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = path.join(relativePrefix, entry.name);
    const fullPath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

function isPrivateCredentialPath(relPath) {
  const parts = relPath.replace(/\\/g, '/').split('/');
  return parts.some(part => /(^|[._-])(credentials?|secrets?|private|tokens?|passwords?|apikeys?|.*\.pem|.*\.key)([._-]|$)/i.test(part));
}

function validatePackagingSecurity(rootDir, files) {
  if (files.some(isPrivateCredentialPath)) {
    return 'Release contains private or credential-bearing filenames.';
  }
  const productionConfig = path.join(rootDir, 'config.production.json');
  if (fs.existsSync(productionConfig)) {
    try {
      readConfigFile(productionConfig);
    } catch {
      return 'Production configuration contains prohibited private data or unsupported settings.';
    }
  }
  return null;
}

function shouldIncludeFile(relPath) {
  // Normalize path separators to forward slash
  const norm = relPath.replace(/\\/g, '/');

  // Hard exclusions
  const forbiddenDirs = [
    '.git', '.scratch', '.pi', '.venv', '.ruff_cache',
    'archive', 'self-media', 'selfteaching', 'reference', 'zettelkasten',
    'tests', '__pycache__', 'node_modules', 'dist'
  ];
  for (const dir of forbiddenDirs) {
    if (norm === dir || norm.startsWith(dir + '/')) {
      return false;
    }
  }

  if (isPrivateCredentialPath(norm)) {
    return false;
  }

  // File extension / name exclusions
  const forbiddenFiles = ['.env', '.env.local', '.gitignore', '.gitmodules', 'pyrightconfig.json'];
  const baseName = path.basename(norm);
  if (forbiddenFiles.includes(baseName) || baseName.startsWith('.env.')) {
    return false;
  }
  if (norm.endsWith('.pyc') || norm.endsWith('.db') || norm.endsWith('.tmp')) {
    return false;
  }

  // Target allowed roots / files
  const allowedRoots = [
    'curriculum/',
    'assets/',
    'lessons/',
    'lib/',
    'docs/operations/'
  ];
  const allowedFiles = [
    'server.cjs',
    'package.json',
    'config.production.json',
    'LICENSE',
    'LICENSE-CC-BY-SA-4.0',
    'NOTICE',
    'scripts/backup.cjs',
    'scripts/restore.cjs',
    'scripts/rollback.cjs',
    'scripts/list_corrections.cjs'
  ];
  if (allowedFiles.includes(norm)) return true;
  for (const prefix of allowedRoots) {
    if (norm.startsWith(prefix)) return true;
  }

  return false;
}

function main() {
  const version = getVersion();
  const validation = validateCurriculumSources(ROOT);
  if (!validation.valid) {
    console.error(`\n❌ Source Rights Audit FAILED with ${validation.errors.length} error(s):`);
    validation.errors.forEach(error => console.error(`  - ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Building release delivery package for 90-Day AI Learning v${version}...`);

  // Candidate file gathering
  const candidateRoots = [
    'server.cjs',
    'package.json',
    'config.production.json',
    'LICENSE',
    'LICENSE-CC-BY-SA-4.0',
    'NOTICE',
    'scripts/backup.cjs',
    'scripts/restore.cjs',
    'scripts/rollback.cjs',
    'scripts/list_corrections.cjs'
  ];

  const candidateDirs = ['curriculum', 'assets', 'lessons', 'lib', 'docs/operations'];

  const allFiles = [];

  for (const f of candidateRoots) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
      allFiles.push(f);
    }
  }

  for (const d of candidateDirs) {
    const dirFull = path.join(ROOT, d);
    if (fs.existsSync(dirFull)) {
      const files = collectFiles(dirFull, d);
      allFiles.push(...files);
    }
  }

  const includedFiles = allFiles
    .map(f => f.replace(/\\/g, '/'))
    .filter(shouldIncludeFile)
    .sort();

  const uniqueIncludedFiles = [...new Set(includedFiles)];
  const securityError = validatePackagingSecurity(ROOT, uniqueIncludedFiles);
  if (securityError) {
    console.error(`FATAL: ${securityError}`);
    process.exitCode = 1;
    return;
  }

  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  console.log(`Discovered ${uniqueIncludedFiles.length} release files after applying clean inclusion/exclusion filter.`);

  // Write temporary file list for tar
  const tmpFileListPath = path.join(distDir, '.filelist.tmp');
  fs.writeFileSync(tmpFileListPath, uniqueIncludedFiles.join('\n') + '\n');

  const tarballName = `90-day-ai-learning-${version}.tar.gz`;
  const tarballPath = path.join(distDir, tarballName);

  // Reproducible tarball flags
  const tarCmd = `tar -czf "${tarballPath}" -T "${tmpFileListPath}" --sort=name --mtime=@1700000000 --owner=0 --group=0 --numeric-owner`;
  try {
    execSync(tarCmd, { cwd: ROOT });
  } finally {
    if (fs.existsSync(tmpFileListPath)) {
      fs.rmSync(tmpFileListPath);
    }
  }

  const tarballSha256 = computeSha256(tarballPath);
  const tarballStat = fs.statSync(tarballPath);

  // Generate checksums
  const checksumLines = [`${tarballSha256}  ${tarballName}`];
  for (const file of uniqueIncludedFiles) {
    const full = path.join(ROOT, file);
    checksumLines.push(`${computeSha256(full)}  ${file}`);
  }
  fs.writeFileSync(path.join(distDir, 'checksums.txt'), checksumLines.join('\n') + '\n');

  // Generate package manifest
  const manifest = {
    name: '90-day-ai-learning',
    version,
    timestamp: new Date().toISOString(),
    archive: tarballName,
    sizeBytes: tarballStat.size,
    sha256: tarballSha256,
    included_files_count: uniqueIncludedFiles.length,
    included_files: uniqueIncludedFiles
  };
  fs.writeFileSync(path.join(distDir, 'package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nSuccessfully created delivery artifact:`);
  console.log(`- Archive: ${tarballPath} (${tarballStat.size} bytes)`);
  console.log(`- SHA-256: ${tarballSha256}`);
  console.log(`- Manifest: ${path.join(distDir, 'package-manifest.json')}`);
  console.log(`- Checksums: ${path.join(distDir, 'checksums.txt')}`);
}

if (require.main === module) {
  main();
}

module.exports = { getVersion, shouldIncludeFile };
