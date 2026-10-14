import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Canary build (TB_BUILD=canary): enables the page-world debug bridge in
// debug.js and writes to .canary/dist so the dist/ you load in Chrome never
// ships the bridge.
const isCanary = process.env.TB_BUILD === 'canary';
const outDir = isCanary ? '.canary/dist' : 'dist';
const define = { __TB_DEBUG_BRIDGE__: JSON.stringify(isCanary) };

// Ensure dist directories exist
mkdirSync(`${outDir}/icons`, { recursive: true });

// Bundle content script (IIFE — Chrome doesn't support ES modules in content scripts)
const contentBuild = {
  entryPoints: ['src/content/content.js'],
  bundle: true,
  outfile: `${outDir}/content.js`,
  format: 'iife',
  define,
  target: 'chrome120',
};

// Bundle service worker (ESM — Chrome supports ES modules in service workers)
const swBuild = {
  entryPoints: ['src/background/service-worker.js'],
  bundle: true,
  outfile: `${outDir}/service-worker.js`,
  format: 'esm',
  define,
  target: 'chrome120',
};

// Copy static assets into dist/
cpSync('styles/content.css', `${outDir}/content.css`);
cpSync('manifest.json', `${outDir}/manifest.json`);
cpSync('icons', `${outDir}/icons`, { recursive: true });

if (isWatch) {
  const ctx1 = await esbuild.context(contentBuild);
  const ctx2 = await esbuild.context(swBuild);
  await ctx1.watch();
  await ctx2.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(contentBuild);
  await esbuild.build(swBuild);
  console.log('Build complete.');
}
