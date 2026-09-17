import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const postgresSchemaPath = resolve(packageRoot, 'prisma/schema.prisma');
const sqliteSchemaPath = resolve(packageRoot, 'prisma/sqlite/schema.prisma');

const postgresSchema = await readFile(postgresSchemaPath, 'utf8');
const sqliteSchema = postgresSchema
  .replace('provider = "postgresql"', 'provider = "sqlite"')
  .replace(/\s+@db\.[A-Za-z]+(?:\([^)]*\))?/g, '');

const currentSqliteSchema = await readFile(sqliteSchemaPath, 'utf8').catch(() => null);
if (currentSqliteSchema !== sqliteSchema) {
  await writeFile(sqliteSchemaPath, sqliteSchema, 'utf8');
}
