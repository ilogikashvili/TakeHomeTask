// Prisma calls its server trust certificate `sslcert`; node-postgres calls it
// `sslrootcert` (`sslcert` there means a client certificate). Preserve TLS mode
// and map only that CA parameter for deployment scripts using the migration URL.
function pgMigrationUrl(value) {
  const url = new URL(value);
  if (url.searchParams.has('sslcert')) {
    if (url.searchParams.has('sslrootcert')) throw new Error('Use one server CA parameter in the migration URL');
    url.searchParams.set('sslrootcert', url.searchParams.get('sslcert'));
    url.searchParams.delete('sslcert');
  }
  url.searchParams.delete('sslaccept');
  return url.href;
}
module.exports = { pgMigrationUrl };
