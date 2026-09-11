// Configure only the disposable GitHub Actions PostgreSQL service, after all
// plaintext development/browser checks. Never run against a deployment host.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
async function main() {
  const container = process.env.CI_POSTGRES_CONTAINER;
  if (process.env.GITHUB_ACTIONS !== 'true' || !/^[a-f0-9]{12,64}$/.test(container || '')) {
    throw new Error('Only the disposable GitHub Actions PostgreSQL service is supported');
  }
  const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
    if (result.status !== 0) throw new Error('CI PostgreSQL TLS fixture setup failed');
  };
  const directory = resolve('test-results/ci-postgres-tls');
  run(process.execPath, ['scripts/create-tls-test-certificates.cjs', directory]);
  run('docker', ['exec', '--user', 'root', container, 'mkdir', '-p', '/tmp/ledger-tls']);
  for (const file of ['server.crt', 'server.key']) run('docker', ['cp', directory + '/' + file, container + ':/tmp/ledger-tls/' + file]);
  run('docker', ['cp', '../deploy/postgres/pg_hba.conf', container + ':/tmp/ledger-tls/pg_hba.conf']);
  run('docker', ['exec', '--user', 'root', container, 'chown', 'postgres:postgres', '/tmp/ledger-tls/server.key']);
  run('docker', ['exec', '--user', 'root', container, 'chmod', '600', '/tmp/ledger-tls/server.key']);
  for (const setting of [
    "ssl = 'on'", "ssl_cert_file = '/tmp/ledger-tls/server.crt'", "ssl_key_file = '/tmp/ledger-tls/server.key'",
    "ssl_min_protocol_version = 'TLSv1.2'", "password_encryption = 'scram-sha-256'", "hba_file = '/tmp/ledger-tls/pg_hba.conf'",
  ]) run('docker', ['exec', '--user', 'postgres', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres', '-c', 'ALTER SYSTEM SET ' + setting]);
  run('docker', ['restart', container]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'pipe' }).status === 0) { ready = true; break; }
    await delay(500);
  }
  if (!ready) throw new Error('Disposable TLS PostgreSQL did not become ready');
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL);
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('sslcert', directory + '/ca.crt');
  const result = spawnSync(process.execPath, ['scripts/verify-postgres-tls.cjs'], {
    env: { ...process.env, TLS_TEST_ADMIN_URL: url.href, TLS_TEST_UNTRUSTED_CA: directory + '/untrusted.crt' }, stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('CI PostgreSQL TLS verification failed');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
