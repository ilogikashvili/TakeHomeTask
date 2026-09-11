// Invoked by the existing migration service after prisma migrate deploy.
// The grant script must run as the migration owner, not the runtime login.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Pool } = require('pg');
const { pgMigrationUrl } = require('./pg-migration-url.cjs');
async function main() {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
  const pool = new Pool({ connectionString: pgMigrationUrl(ownerUrl) });
  try {
    await pool.query(readFileSync(join(__dirname, 'runtime-grants.sql'), 'utf8'));
    console.log('Deployment role grants applied.');
  } finally { await pool.end(); }
}
main().catch(error => {
  console.error('Deployment role grants failed; backend must remain stopped.');
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
