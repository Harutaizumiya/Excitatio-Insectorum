import { spawnSync } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sqliteSchemaDirectory = resolve(packageRoot, 'prisma/sqlite');
const prismaCommand = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
const databaseUrl = process.env.DATABASE_URL?.startsWith('file:')
  ? process.env.DATABASE_URL
  : 'file:./dev.db';

if (databaseUrl.startsWith('file:')) {
  const databaseReference = databaseUrl.slice('file:'.length).split('?')[0];
  if (databaseReference && databaseReference !== ':memory:') {
    const databasePath = isAbsolute(databaseReference)
      ? databaseReference
      : resolve(sqliteSchemaDirectory, databaseReference);
    await mkdir(dirname(databasePath), { recursive: true });
    const databaseFile = await open(databasePath, 'a');
    await databaseFile.close();
  }
}

const result = spawnSync(prismaCommand, process.argv.slice(2), {
  cwd: packageRoot,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
