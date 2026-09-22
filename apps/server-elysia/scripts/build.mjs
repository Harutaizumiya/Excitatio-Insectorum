import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

mkdirSync('dist', { recursive: true });
execFileSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve('esbuild/bin/esbuild'),
    'src/index.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node22',
    '--packages=external',
    '--outfile=dist/index.js',
  ],
  { stdio: 'inherit' },
);
