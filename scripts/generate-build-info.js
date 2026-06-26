#!/usr/bin/env node
/**
 * Writes dist/build-info.json at build time so the running process can prove
 * exactly which commit / build it is executing. Read at runtime by
 * src/utils/buildInfo.ts and surfaced in startup logs + /health + dashboard.
 *
 * Git SHA resolution order (first hit wins):
 *   1. Explicit env (GIT_SHA) — pass via Docker --build-arg or CI.
 *   2. Platform-provided env (RENDER_GIT_COMMIT, SOURCE_VERSION, SOURCE_COMMIT).
 *   3. `git rev-parse` — works locally and in CI where .git is present.
 *   4. 'unknown' — never throws; a missing SHA must not fail a build.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function resolveGitSha() {
  const fromEnv =
    process.env.GIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.SOURCE_VERSION ||
    process.env.SOURCE_COMMIT;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function resolveGitDirty() {
  try {
    const out = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

let version = '0.0.0';
try {
  version = require(path.join(__dirname, '..', 'package.json')).version || version;
} catch {
  /* ignore — version is best-effort */
}

const info = {
  version,
  gitSha: resolveGitSha(),
  dirty: resolveGitDirty(),
  builtAt: new Date().toISOString(),
  nodeVersion: process.version
};

const distDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, 'build-info.json');
fs.writeFileSync(outPath, JSON.stringify(info, null, 2));

console.log(
  `🏷️  build-info: ${info.version} @ ${info.gitSha}${info.dirty ? '-dirty' : ''} (${info.builtAt})`
);
