/**
 * Canary global setup: bundle the probe (real src/ modules) into a single
 * IIFE file that fixtures inject via addInitScript — injection through CDP
 * bypasses the page CSP, a plain <script> tag would be blocked.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

export const CANARY_DIR = '.canary';
export const PROBE_BUNDLE = path.join(CANARY_DIR, 'probe.bundle.js');

export default async function globalSetup() {
  fs.mkdirSync(CANARY_DIR, { recursive: true });

  await build({
    entryPoints: ['tests/canary/probe/probe-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: PROBE_BUNDLE,
    logLevel: 'silent',
  });

  // The extension smoke spec loads dist/ into a persistent context; fail
  // early with a clear message instead of a confusing launch error.
  if (!fs.existsSync('dist/manifest.json')) {
    throw new Error('dist/manifest.json 不存在 — 先跑 npm run build（npm run canary 會自動做）');
  }
}
