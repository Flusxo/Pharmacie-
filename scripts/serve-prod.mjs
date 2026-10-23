// Serves the PRODUCTION build (frontend/dist) like the hosting does: brotli/gzip, long cache for hashed files, the
// _headers file honoured, SPA fallback, and /api proxied to the local API. Used by scripts/perf.mjs.
// usage: node scripts/serve-prod.mjs [port] [apiPort]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const port = Number(process.argv[2] ?? 4173);
const apiPort = Number(process.argv[3] ?? 4000);
const root = path.resolve(process.env.DIST ?? 'frontend/dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
};
// Same rules as frontend/public/_headers (Cloudflare Pages).
const headerRules = [];
try {
  const text = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) headerRules.push((current = { pattern: line.trim(), headers: {} }));
    else if (current) {
      const i = line.indexOf(':');
      current.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
} catch {
  // no _headers file: Pages default (revalidate every time)
}
const matches = (pattern, url) => (pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern);
const cache = new Map();

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x').pathname;
    if (url.startsWith('/api')) {
      const p = http.request({ host: 'localhost', port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      p.on('error', () => {
        res.writeHead(502).end();
      });
      req.pipe(p);
      return;
    }
    let file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const ext = path.extname(file);
    const headers = { 'content-type': types[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' };
    for (const r of headerRules) if (matches(r.pattern, url)) Object.assign(headers, r.headers);
    // index.html is read every time (a rebuild changes its asset names); hashed assets are cached.
    let body = ext === '.html' ? fs.readFileSync(file) : cache.get(file);
    if (!body) cache.set(file, (body = fs.readFileSync(file)));
    const accept = String(req.headers['accept-encoding'] ?? '');
    const compressible = ['.html', '.js', '.css', '.json', '.svg', '.hdr'].includes(ext);
    if (compressible && /br/.test(accept)) {
      const key = `${file}:br`;
      let b = ext === '.html' ? undefined : cache.get(key);
      if (!b) cache.set(key, (b = zlib.brotliCompressSync(body)));
      res.writeHead(200, { ...headers, 'content-encoding': 'br', vary: 'accept-encoding' });
      res.end(b);
    } else if (compressible && /gzip/.test(accept)) {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      res.end(zlib.gzipSync(body));
    } else {
      res.writeHead(200, headers);
      res.end(body);
    }
  })
  .listen(port, () => console.log(`production build on http://localhost:${port}`));
