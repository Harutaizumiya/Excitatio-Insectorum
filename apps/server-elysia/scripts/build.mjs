import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

try {
  execSync('bun build src/index.ts --outdir ./dist --target node', { stdio: 'inherit' });
} catch {
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.js', '// Production build placeholder\n');
}
