import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const helperPath = fileURLToPath(new URL('./split-pnpm-store.mjs', import.meta.url));

test('splits the pnpm store and preserves root node_modules entries', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'split-pnpm-store-'));
  t.after(() => rm(fixture, { force: true, recursive: true }));

  const sourceModules = join(fixture, 'input', 'node_modules');
  const storePath = join(sourceModules, '.pnpm');
  const groupsPath = join(fixture, 'output', 'groups');
  const rootModulesPath = join(fixture, 'output', 'root-modules');
  const packageEntries = [
    ['@scope+sample@1.0.0', 1024],
    ['croner@10.0.1', 2048],
    ['elysia@1.4.30', 3072],
    ['zod@4.0.0', 4096],
  ];

  for (const [name, size] of packageEntries) {
    const packageName = name.split('@')[0] || 'sample';
    const packagePath = join(storePath, name, 'node_modules', packageName);
    await mkdir(packagePath, { recursive: true });
    await writeFile(join(packagePath, 'index.js'), Buffer.alloc(size, name));
  }

  await mkdir(join(sourceModules, '.bin'), { recursive: true });
  await mkdir(join(sourceModules, '.prisma', 'client'), { recursive: true });
  await writeFile(join(sourceModules, '.bin', 'prisma'), '#!/bin/sh\n');
  await writeFile(join(sourceModules, '.prisma', 'client', 'schema.prisma'), 'datasource db {}\n');
  await writeFile(join(sourceModules, '.modules.yaml'), 'layoutVersion: 5\n');

  if (process.platform !== 'win32') {
    await symlink(
      relative(sourceModules, join(storePath, 'croner@10.0.1', 'node_modules', 'croner')),
      join(sourceModules, 'croner'),
      'dir',
    );
  }

  const result = spawnSync(
    process.execPath,
    [helperPath, storePath, groupsPath, rootModulesPath, '3'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const groupNames = await readdir(groupsPath);
  assert.equal(groupNames.length, 3);

  const groupedEntries = [];
  for (const groupName of groupNames) {
    groupedEntries.push(...(await readdir(join(groupsPath, groupName))));
  }
  assert.deepEqual(groupedEntries.sort(), packageEntries.map(([name]) => name).sort());

  const runtimeModules = join(fixture, 'output', 'runtime-node_modules');
  await mkdir(join(runtimeModules, '.pnpm'), { recursive: true });
  for (const groupName of groupNames) {
    await cp(join(groupsPath, groupName), join(runtimeModules, '.pnpm'), {
      dereference: false,
      recursive: true,
    });
  }
  await cp(rootModulesPath, runtimeModules, {
    dereference: false,
    recursive: true,
  });

  assert.equal(await readFile(join(runtimeModules, '.bin', 'prisma'), 'utf8'), '#!/bin/sh\n');
  assert.equal(
    await readFile(join(runtimeModules, '.prisma', 'client', 'schema.prisma'), 'utf8'),
    'datasource db {}\n',
  );
  assert.equal(await readFile(join(runtimeModules, '.modules.yaml'), 'utf8'), 'layoutVersion: 5\n');
  assert.equal((await lstat(join(runtimeModules, '.pnpm', 'croner@10.0.1'))).isDirectory(), true);

  if (process.platform !== 'win32') {
    assert.equal((await lstat(join(runtimeModules, 'croner'))).isSymbolicLink(), true);
    assert.equal(
      await readFile(join(runtimeModules, 'croner', 'index.js'), 'utf8'),
      Buffer.alloc(2048, 'croner@10.0.1').toString(),
    );
  }
});
