import * as esbuild from 'esbuild';
import { cpSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/content/content.js'],
  bundle: true,
  outfile: 'dist/content.js',
  format: 'iife',
  target: 'chrome120',
};

// Copy CSS
cpSync('styles/content.css', 'dist/content.css');

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete.');
}
