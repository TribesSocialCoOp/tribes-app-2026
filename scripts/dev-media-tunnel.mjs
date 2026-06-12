/**
 * Dev media tunnel — forwards local SeaweedFS ports to the remote host.
 *
 * The app's .env.local uses localhost:8333 (S3 API) and localhost:8888 (filer /
 * public media) on purpose so they satisfy CSP. SeaweedFS itself runs remotely
 * on an internal-network host, so we forward those local ports to it.
 *
 * Usage: node scripts/dev-media-tunnel.mjs
 * Override host: MEDIA_HOST=172.19.142.69 node scripts/dev-media-tunnel.mjs
 */
import net from 'node:net';

const REMOTE_HOST = process.env.MEDIA_HOST || '172.19.142.69';
const PORTS = [8333, 8888]; // S3 API, filer/public

for (const port of PORTS) {
  const server = net.createServer((local) => {
    const remote = net.connect(port, REMOTE_HOST);
    local.on('error', () => remote.destroy());
    remote.on('error', () => local.destroy());
    local.pipe(remote);
    remote.pipe(local);
  });

  server.on('error', (err) => {
    console.error(`[media-tunnel] :${port} failed: ${err.message}`);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[media-tunnel] localhost:${port} → ${REMOTE_HOST}:${port}`);
  });
}

console.log('[media-tunnel] forwarding active — Ctrl+C to stop');
