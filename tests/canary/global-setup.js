/**
 * Canary global setup: bundle the probe (real src/ modules) into a single
 * IIFE file that fixtures inject via addInitScript — injection through CDP
 * bypasses the page CSP, a plain <script> tag would be blocked.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { CANARY_DIR, PROBE_BUNDLE, EXTENSION_DIR } from './paths.js';

export default async function globalSetup() {
  fs.mkdirSync(CANARY_DIR, { recursive: true });

  await build({
    entryPoints: ['tests/canary/probe/probe-entry.js'],
    bundle: true,
    format: 'iife',
    outfile: PROBE_BUNDLE,
    logLevel: 'silent',
  });

  // The extension smoke spec loads the canary build (bridge enabled) into a
  // persistent context; fail early with a clear message instead of a
  // confusing launch error.
  if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
    throw new Error(
      `${EXTENSION_DIR}/manifest.json 不存在 — 先跑 TB_BUILD=canary npm run build（npm run canary 會自動做）`
    );
  }
}
