// Local verification only. Never restores over an existing database.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const source = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!source.pathname.endsWith('_e2e')) source.pathname += '_e2e';
const targetName = 'ledger_' + Date.now() + '_restore_verify';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL || 'postgresql://postgres@localhost:5432/postgres';
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const directory = path.resolve(__dirname, '../test-results');
mkdirSync(directory, { recursive: true });
const archive = path.join(directory, targetName + '.dump');
const pgEnv = url => ({ ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGCONNECT_TIMEOUT: '5' });
const run = (tool, args, url) => execFileSync(path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')), args, { env: pgEnv(url), stdio: 'pipe', windowsHide: true });
async function fingerprints(url) {
  const client = new Client({ connectionString: url.href }); await client.connect();
  try {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows;
    const result = {};
    for (const { tablename } of tables) {
      if (!/^\w+$/.test(tablename)) throw new Error('Unsupported table identifier');
      result[tablename] = (await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS digest FROM "${tablename}" t`)).rows[0];
    }
    return result;
  } finally { await client.end(); }
}
(async () => {
  const started = Date.now();
  const admin = new Client({ connectionString: adminUrl }); await admin.connect();
  let created = false;
  try {
    const before = await fingerprints(source);
    run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', archive], source);
    if (!/^ledger_\d+_restore_verify$/.test(targetName)) throw new Error('Unsafe target name');
    await admin.query(`CREATE DATABASE "${targetName}"`); created = true;
    const target = new URL(adminUrl); target.pathname = '/' + targetName;
    run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', targetName, archive], target);
    const restored = await fingerprints(target);
    if (JSON.stringify(before) !== JSON.stringify(restored)) throw new Error('Restored data differs from source');
    console.log(JSON.stringify({ status: 'passed', tables: Object.keys(before).length, elapsedMs: Date.now() - started, archive, sourceDatabase: source.pathname.slice(1), verification: 'All public-table row counts and content digests match; pg_restore succeeded.' }, null, 2));
  } finally {
    if (created) await admin.query(`DROP DATABASE "${targetName}"`);
    await admin.end();
  }
})().catch(error => { console.error('Restore drill failed:', error.code || error.message); process.exitCode = 1; });
