/**
 * Runtime accessor for the build stamp written by scripts/generate-build-info.js.
 *
 * Purpose: make "is the running process the same as the committed source?"
 * provable and loud. The stale `dist/` that caused 0.01-lot trades was invisible
 * because nothing reported which build was actually running.
 *
 * - getBuildInfo() is cached after first read.
 * - The staleness check only runs when a `src/` tree is present next to the
 *   process (local dev / Hostinger `npm start`). In a pruned Docker runtime
 *   image there is no `src/`, so it never produces a false positive there.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

export interface BuildInfo {
  version: string;
  gitSha: string;
  dirty: boolean;
  builtAt: string; // ISO timestamp, or 'unknown' if build-info.json missing
  nodeVersion: string;
  /** True when a source file is newer than the running build (dev/Hostinger only). */
  stale: boolean;
  /** Human-readable reason, set when stale or when build-info.json is missing. */
  staleReason?: string;
}

let cached: BuildInfo | null = null;

const UNKNOWN: Omit<BuildInfo, 'stale' | 'staleReason'> = {
  version: 'unknown',
  gitSha: 'unknown',
  dirty: false,
  builtAt: 'unknown',
  nodeVersion: process.version
};

function readBuildInfoFile(): Omit<BuildInfo, 'stale' | 'staleReason'> {
  // Compiled file lives at dist/utils/buildInfo.js → build-info.json is at dist/build-info.json
  const infoPath = path.join(__dirname, '..', 'build-info.json');
  try {
    const raw = fs.readFileSync(infoPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version ?? UNKNOWN.version,
      gitSha: parsed.gitSha ?? UNKNOWN.gitSha,
      dirty: Boolean(parsed.dirty),
      builtAt: parsed.builtAt ?? UNKNOWN.builtAt,
      nodeVersion: parsed.nodeVersion ?? process.version
    };
  } catch {
    return { ...UNKNOWN };
  }
}

/** Newest mtime (ms) under a directory tree, or 0 if it can't be read. */
function newestMtimeMs(dir: string): number {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          /* ignore unreadable file */
        }
      }
    }
  }
  return newest;
}

function computeStaleness(builtAt: string): { stale: boolean; staleReason?: string } {
  if (builtAt === 'unknown') {
    return {
      stale: true,
      staleReason: 'dist/build-info.json missing — run `npm run build` (build stamp absent)'
    };
  }
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    // No source shipped alongside (e.g. Docker runtime image) — cannot be stale.
    return { stale: false };
  }
  const builtMs = Date.parse(builtAt);
  if (!Number.isFinite(builtMs)) return { stale: false };
  const newestSrcMs = newestMtimeMs(srcDir);
  if (newestSrcMs > builtMs) {
    const drift = Math.round((newestSrcMs - builtMs) / 1000);
    return {
      stale: true,
      staleReason: `source is ${drift}s newer than the running build — run \`npm run build\``
    };
  }
  return { stale: false };
}

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;

  // Running via ts-node (npm run dev) executes source directly — there is no
  // compiled artifact to be stale against, so don't flag or read build-info.json.
  if (__filename.endsWith('.ts')) {
    let version = 'dev';
    try {
      version = require(path.join(process.cwd(), 'package.json')).version || 'dev';
    } catch {
      /* best-effort */
    }
    cached = {
      version,
      gitSha: 'dev',
      dirty: false,
      builtAt: 'dev (ts-node)',
      nodeVersion: process.version,
      stale: false
    };
    return cached;
  }

  const base = readBuildInfoFile();
  const { stale, staleReason } = computeStaleness(base.builtAt);
  cached = { ...base, stale, staleReason };
  return cached;
}

/** Loud, single-line build banner for startup logs. Warns hard when stale. */
export function logBuildBanner(): void {
  const info = getBuildInfo();
  const tag = `${info.version} @ ${info.gitSha}${info.dirty ? '-dirty' : ''}`;
  logger.info(`🏷️  Build: ${tag} | built ${info.builtAt} | node ${info.nodeVersion}`);
  if (info.stale) {
    logger.error(
      `🚨 STALE BUILD: the running code may not match source — ${info.staleReason}. ` +
        `Trades could execute on outdated logic. Rebuild before trading.`
    );
  }
}
