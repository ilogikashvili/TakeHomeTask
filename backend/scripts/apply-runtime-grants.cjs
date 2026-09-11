// Invoked by the existing migration service after prisma migrate deploy.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Pool } = require('pg');
const { pgMigrationUrl } = require('./pg-migration-url.cjs');
async function main() {
  const pool = new Pool({ connectionString: pgMigrationUrl(process.env.DATABASE_URL) });
  try {
    await pool.query(readFileSync(join(__dirname, 'runtime-grants.sql'), 'utf8'));
    console.log('Deployment role grants applied.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Deployment role grants failed; backend must remain stopped.'); process.exitCode = 1; });
