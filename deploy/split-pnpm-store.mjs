import { cp, lstat, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const [storePath, groupsPath, rootModulesPath, groupCountText] = process.argv.slice(2);
const groupCount = Number(groupCountText);

if (
  !storePath ||
  !groupsPath ||
  !rootModulesPath ||
  !Number.isInteger(groupCount) ||
  groupCount < 2
) {
  throw new Error(
    'Usage: split-pnpm-store.mjs <store> <groups-dir> <root-modules-dir> <group-count>',
  );
}

async function treeSize(path) {
  let size = 0;
  const pending = [path];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    const currentStat = await lstat(currentPath);

    if (currentStat.isSymbolicLink()) {
      size += currentStat.size;
      continue;
    }

    if (!currentStat.isDirectory()) {
      size += currentStat.size;
      continue;
    }

    const children = await readdir(currentPath, { withFileTypes: true });
    for (const child of children) {
      pending.push(join(currentPath, child.name));
    }
  }

  return size;
}

const storeEntries = await readdir(storePath);
const sizedEntries = [];
for (let offset = 0; offset < storeEntries.length; offset += 16) {
  const batch = storeEntries.slice(offset, offset + 16);
  sizedEntries.push(
    ...(await Promise.all(
      batch.map(async (name) => ({
        name,
        size: await treeSize(join(storePath, name)),
      })),
    )),
  );
}
sizedEntries.sort((left, right) => right.size - left.size);

const groups = Array.from({ length: groupCount }, () => ({
  entries: [],
  size: 0,
}));

for (const entry of sizedEntries) {
  groups.sort((left, right) => left.size - right.size);
  groups[0].entries.push(entry.name);
  groups[0].size += entry.size;
}

for (const [index, group] of groups.entries()) {
  const destination = join(groupsPath, String(index));
  await mkdir(destination, { recursive: true });

  for (const name of group.entries) {
    await cp(join(storePath, name), join(destination, name), {
      dereference: false,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
      recursive: true,
    });
  }

  console.log(
    `pnpm store layer ${index}: ${group.entries.length} entries, ${(group.size / 1024 / 1024).toFixed(1)} MiB`,
  );
}

await mkdir(rootModulesPath, { recursive: true });
const rootEntries = (await readdir(join(storePath, '..'))).filter((name) => name !== '.pnpm');

for (const name of rootEntries) {
  await cp(join(storePath, '..', name), join(rootModulesPath, name), {
    dereference: false,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
    recursive: true,
  });
}

console.log(`pnpm root entries: ${rootEntries.length}`);
