import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/index.mjs'],
  bundle: true,
  minify: true,
  target: ['es2020'],
  legalComments: 'inline',
  platform: 'browser',
  format: 'esm',
  outfile: 'dist/index.mjs'
});
