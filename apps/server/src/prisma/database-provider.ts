export function isPostgresDatabase(databaseUrl = process.env.DATABASE_URL): boolean {
  return typeof databaseUrl === 'string' && /^(postgres|postgresql):\/\//.test(databaseUrl);
}
