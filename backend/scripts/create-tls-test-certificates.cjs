// Disposable verification only. Production certificates come from the operator.
const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, chmodSync, existsSync } = require('node:fs');
const { resolve, join, sep } = require('node:path');
const root = resolve('test-results');
const directory = resolve(process.argv[2] || 'test-results/postgres-tls');
if (!directory.startsWith(root + sep) || existsSync(directory)) throw new Error('Use a new directory inside backend/test-results');
mkdirSync(directory, { recursive: true });
const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
function run(args) {
  const result = spawnSync(openssl, args, { cwd: directory, stdio: 'pipe', windowsHide: true });
  if (result.status !== 0) throw new Error('Disposable TLS certificate generation failed');
}
run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2', '-subj', '/CN=Ledger disposable test CA', '-keyout', 'ca.key', '-out', 'ca.crt']);
run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=db', '-keyout', 'server.key', '-out', 'server.csr']);
writeFileSync(join(directory, 'server.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:db,DNS:localhost,IP:127.0.0.1\n');
run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-sha256', '-extfile', 'server.ext', '-out', 'server.crt']);
run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2', '-subj', '/CN=Untrusted disposable CA', '-keyout', 'untrusted.key', '-out', 'untrusted.crt']);
for (const file of ['ca.key', 'server.key', 'untrusted.key']) chmodSync(join(directory, file), 0o600);
console.log('Disposable TLS certificates created; no certificate or key material printed.');
