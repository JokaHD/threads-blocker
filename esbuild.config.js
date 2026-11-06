import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Canary build (TB_BUILD=canary): enables the page-world debug bridge in
// debug.js and writes to .canary/dist so the dist/ you load in Chrome never
// ships the bridge.
const isCanary = process.env.TB_BUILD === 'canary';
// Release build (TB_BUILD=release, used by the release workflow): strips the
// [TB-dev] failure logs that every other build keeps.
const isRelease = process.env.TB_BUILD === 'release';
const outDir = isCanary ? '.canary/dist' : 'dist';
const define = {
  __TB_DEBUG_BRIDGE__: JSON.stringify(isCanary),
  __TB_DEV_LOG__: JSON.stringify(!isRelease),
};
// Without syntax minification esbuild keeps `if (false) { … }` blocks, so the
// flags above would only disable that code, not remove it from the shipped zip.
const minifySyntax = isRelease;

// Ensure dist directories exist
mkdirSync(`${outDir}/icons`, { recursive: true });

// Bundle content script (IIFE — Chrome doesn't support ES modules in content scripts)
const contentBuild = {
  entryPoints: ['src/content/content.js'],
  bundle: true,
  outfile: `${outDir}/content.js`,
  format: 'iife',
  define,
  minifySyntax,
  target: 'chrome120',
};

// Bundle service worker (ESM — Chrome supports ES modules in service workers)
const swBuild = {
  entryPoints: ['src/background/service-worker.js'],
  bundle: true,
  outfile: `${outDir}/service-worker.js`,
  format: 'esm',
  define,
  minifySyntax,
  target: 'chrome120',
};

// Copy static assets into dist/
cpSync('styles/content.css', `${outDir}/content.css`);
cpSync('manifest.json', `${outDir}/manifest.json`);
cpSync('icons', `${outDir}/icons`, { recursive: true });

const builds = [contentBuild, swBuild];

if (isWatch) {
  for (const options of builds) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
  console.log('Watching for changes...');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  console.log('Build complete.');
}
