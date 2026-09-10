// Rebuild only the explicitly named *_e2e database. Never seed the application DB.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { spawnSync } = require('node:child_process');
const quote = value => '"' + value.replace(/"/g, '""') + '"';
async function main() {
  const appUrl = new URL(process.env.DATABASE_URL);
  const testUrl = new URL(process.env.TEST_DATABASE_URL || appUrl);
  if (!process.env.TEST_DATABASE_URL) testUrl.pathname = appUrl.pathname + '_e2e';
  const db = decodeURIComponent(testUrl.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+_e2e$/.test(db) || (testUrl.host === appUrl.host && testUrl.pathname === appUrl.pathname)) throw new Error('E2E database must be separate and end in _e2e');
  if (process.env.TEST_DATABASE_ADMIN_URL) {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL });
    try {
      if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [db])).rowCount) {
        await admin.query(`CREATE DATABASE ${quote(db)} OWNER ${quote(decodeURIComponent(testUrl.username))}`);
      }
    } finally { await admin.end(); }
  }
  const readonly = new URL(process.env.READONLY_DATABASE_URL || testUrl);
  readonly.pathname = testUrl.pathname;
  process.env.DATABASE_URL = testUrl.href;
  process.env.READONLY_DATABASE_URL = readonly.href;
  process.env.NODE_ENV = 'test';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  const run = (entry, args) => {
    const result = spawnSync(process.execPath, [require.resolve(entry), ...args], { stdio: 'inherit', env: process.env });
    if (result.status !== 0) throw new Error('E2E setup or tests failed');
  };
  run('prisma/build/index.js', ['migrate', 'deploy']);
  const pool = new Pool({ connectionString: testUrl.href });
  try {
    const role = quote(decodeURIComponent(readonly.username));
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  } finally { await pool.end(); }
  run('tsx/cli', ['prisma/seed/seed.ts']);
  run('jest/bin/jest', ['--config', './test/jest-e2e.json', '--runInBand', ...process.argv.slice(2).filter(arg => arg !== '--runInBand')]);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
