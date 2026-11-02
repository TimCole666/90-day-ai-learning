'use strict';

const MIN_NODE_VERSION = Object.freeze({ major: 22, minor: 13, patch: 0 });

function parseNodeVersion(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function isSupportedNodeVersion(version = process.versions.node) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  if (parsed.major !== MIN_NODE_VERSION.major) return parsed.major > MIN_NODE_VERSION.major;
  if (parsed.minor !== MIN_NODE_VERSION.minor) return parsed.minor > MIN_NODE_VERSION.minor;
  return parsed.patch >= MIN_NODE_VERSION.patch;
}

function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(`Node.js >= ${MIN_NODE_VERSION.major}.${MIN_NODE_VERSION.minor}.${MIN_NODE_VERSION.patch} is required; found ${version}.`);
  }
}

module.exports = {
  MIN_NODE_VERSION,
  isSupportedNodeVersion,
  assertSupportedNodeVersion
};
