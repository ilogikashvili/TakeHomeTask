const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { pgMigrationUrl } = require('./pg-migration-url.cjs');
async function main() {
  const url = new URL(process.env.TLS_TEST_ADMIN_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/postgres'
    || url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict'
    || !url.searchParams.has('sslcert') || !process.env.TLS_TEST_UNTRUSTED_CA) {
    throw new Error('Provide a disposable localhost TLS_TEST_ADMIN_URL with sslmode=require, sslaccept=strict and sslcert, plus TLS_TEST_UNTRUSTED_CA');
  }
  const pool = new Pool({ connectionString: pgMigrationUrl(url.href) });
  try {
    const row = (await pool.query('SELECT ssl, version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];
    if (!row?.ssl || !['TLSv1.2', 'TLSv1.3'].includes(row.version)) throw new Error('TLS 1.2+ required for disposable verification');
    console.log('Disposable PostgreSQL owner connection negotiated ' + row.version + '.');
  } finally { await pool.end(); }
  const env = { ...process.env, ROLE_TEST_ADMIN_URL: url.href, ROLE_TEST_TLS: 'true' };
  const result = spawnSync(process.execPath, ['scripts/verify-deployment-roles.cjs'], { env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('TLS and role verification failed');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
