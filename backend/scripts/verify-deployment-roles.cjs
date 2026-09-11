// Use only a disposable, fresh local cluster. Never targets the application DB.
const { Pool } = require('pg');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');
const { existsSync, mkdirSync, mkdtempSync, rmdirSync } = require('node:fs');
const { pgMigrationUrl } = require('./pg-migration-url.cjs');

async function main() {
  const url = new URL(process.env.ROLE_TEST_ADMIN_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/postgres') {
    throw new Error('ROLE_TEST_ADMIN_URL must target postgres on a disposable local cluster');
  }
  const admin = new Pool({ connectionString: pgMigrationUrl(url.href) });
  const db = 'contract_' + randomBytes(6).toString('hex') + '_e2e';
  const env = { ...process.env, NODE_ENV: 'test' };
  let created = false;
  delete env.GEMINI_API_KEY;
  delete env.GEMINI_MODEL;
  env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
  const run = (command, args, quiet = false, cwd = process.cwd()) => {
    const result = spawnSync(command, args, { env, cwd, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
    // Never echo initializer output: psql's generated password commands may
    // contain secrets if a server rejects one. Report only the failed stage.
    if (result.status !== 0) throw new Error('Role verification subprocess failed: ' + (quiet ? 'role initializer' : args[0]));
  };
  try {
    const version = Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num);
    if (version < 180000 || version >= 190000) throw new Error('Deployment role verification requires PostgreSQL 18');
    if ((await admin.query("SELECT 1 FROM pg_roles WHERE rolname IN ('ledger_runtime','ledger_readonly')")).rowCount) {
      throw new Error('Refusing an existing cluster with deployment roles; initialize a fresh cluster');
    }
    await admin.query(`CREATE DATABASE "${db}"`);
    created = true;
    url.pathname = '/' + db;
    env.DATABASE_URL = url.href;
    env.MIGRATION_DATABASE_URL = url.href;
    env.ROLE_TEST_OWNER_URL = url.href;
    env.ROLE_TEST_PG_OWNER_URL = pgMigrationUrl(url.href);
    env.PGHOST = url.hostname;
    env.PGPORT = url.port || '5432';
    env.PGPASSWORD = decodeURIComponent(url.password);
    env.PGSSLMODE = url.searchParams.get('sslmode') || 'prefer';
    if (url.searchParams.has('sslcert')) {
      env.PGSSLROOTCERT = url.searchParams.get('sslcert');
      // libpq can verify hostname; Prisma's require+strict is its equivalent.
      env.PGSSLMODE = 'verify-full';
    }
    env.POSTGRES_USER = decodeURIComponent(url.username);
    env.POSTGRES_DB = db;
    env.LEDGER_RUNTIME_PASSWORD = randomBytes(24).toString('hex') + "'\\$";
    env.LEDGER_READONLY_PASSWORD = randomBytes(24).toString('hex') + "'\\$";
    if (process.env.PG_BIN) env.PATH = process.env.PG_BIN + (process.platform === 'win32' ? ';' : ':') + env.PATH;
    const shell = process.env.SH_BIN || (process.platform === 'win32' && existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : 'sh');
    run(shell, ['scripts/01-runtime-roles.sh'], true);
    run(shell, ['scripts/01-runtime-roles.sh'], true); // Existing-role/password branch.
    run(process.execPath, [require.resolve('prisma/build/index.js'), 'validate']);
    run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
    run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'status']);
    run(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed/seed.ts']);
    run(process.execPath, [join(__dirname, 'apply-runtime-grants.cjs')]);
    run(process.execPath, [join(__dirname, 'apply-runtime-grants.cjs')]);
    const runtime = new URL(url);
    runtime.username = 'ledger_runtime'; runtime.password = env.LEDGER_RUNTIME_PASSWORD;
    const readonly = new URL(url);
    readonly.username = 'ledger_readonly'; readonly.password = env.LEDGER_READONLY_PASSWORD;
    env.DATABASE_URL = runtime.href;
    env.MIGRATION_DATABASE_URL = url.href;
    env.READONLY_DATABASE_URL = pgMigrationUrl(readonly.href);
    env.ROLE_TEST_PG_RUNTIME_URL = pgMigrationUrl(runtime.href);
    if (env.ROLE_TEST_TLS === 'true') {
      // Exercise unchanged production validation and compiled startup, not a
      // production exception for the local test environment.
      env.NODE_ENV = 'production';
      env.AUTH_JWT_ISSUER = 'ledger-tls-verification';
      env.AUTH_JWT_AUDIENCE = 'ledger-tls-api';
      env.AUTH_JWT_KEYS = JSON.stringify({ current: env.AUTH_JWT_SECRET });
      env.AUTH_JWT_ACTIVE_KEY = 'current';
      env.CORS_ORIGINS = 'https://tls-verification.invalid';
      env.ENABLE_DEMO_LOGIN = 'false';
      env.LOG_LEVEL = 'silent';
    }
    // Nest loads .env from cwd. Isolate it so developer provider credentials
    // cannot be reintroduced after we remove them from the child environment.
    mkdirSync(join(__dirname, '../test-results'), { recursive: true });
    const testCwd = mkdtempSync(join(__dirname, '../test-results/roles-env-'));
    try {
      run(process.execPath, [require.resolve('jest/bin/jest'), '--config', join(__dirname, '../test/jest-roles.json'), '--runInBand'], false, testCwd);
    } finally { rmdirSync(testCwd); }
    console.log('Fresh-cluster deployment role verification passed.');
  } finally {
    try {
      if (created) {
        await admin.query(`DROP DATABASE "${db}"`);
        await admin.query('DROP ROLE IF EXISTS ledger_runtime, ledger_readonly');
      }
    } finally { await admin.end(); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
