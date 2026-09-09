import { PrismaClient } from '@repo/database';
import { Elysia } from 'elysia';

export const prisma = new PrismaClient();

export const prismaPlugin = new Elysia({ name: 'plugin.prisma' }).decorate('prisma', prisma);

export function isPostgresDatabase(databaseUrl = process.env.DATABASE_URL): boolean {
  return typeof databaseUrl === 'string' && /^(postgres|postgresql):\/\//.test(databaseUrl);
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
