import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

// Ensure dist directories exist
mkdirSync('dist/icons', { recursive: true });

// Bundle content script (IIFE — Chrome doesn't support ES modules in content scripts)
const contentBuild = {
  entryPoints: ['src/content/content.js'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  target: 'chrome120',
};

// Bundle service worker (ESM — Chrome supports ES modules in service workers)
const swBuild = {
  entryPoints: ['src/background/service-worker.js'],
  bundle: true,
  outfile: 'dist/service-worker.js',
  format: 'esm',
  target: 'chrome120',
};

// Copy static assets into dist/
cpSync('styles/content.css', 'dist/content.css');
cpSync('manifest.json', 'dist/manifest.json');
cpSync('icons', 'dist/icons', { recursive: true });

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
