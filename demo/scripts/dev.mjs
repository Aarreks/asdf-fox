import { context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public/index.html', 'dist/index.html');
await cp('src/styles.css', 'dist/styles.css');

const ctx = await context({
  entryPoints: ['src/app.js'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true
});
await ctx.watch();
const server = await ctx.serve({ servedir: 'dist', port: 4173, host: '127.0.0.1' });
console.log(`Demo: http://127.0.0.1:${server.port}`);

