import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves a compiled Flutter app and forwards /v1/ to the trusted local API.
// No browser CORS changes, token storage, or request-body logging.
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../build/web'));
const upstream = new URL(process.env.SUPERAGENT_PROXY_TARGET ?? 'http://127.0.0.1:3000');
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
if (upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/' ||
    !(upstream.protocol === 'https:' || (upstream.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)))) {
  throw new Error('Use a trusted HTTPS API origin or loopback HTTP origin.');
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function fail(res, status, code) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { code, message: 'The service is unavailable. Please try again.' } }));
}
const server = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { return fail(res, 400, 'INVALID_REQUEST'); }
  if (url.pathname.startsWith('/v1/')) {
    const headers = {};
    for (const name of ['authorization', 'content-type', 'accept']) if (req.headers[name]) headers[name] = req.headers[name];
    const send = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
    const proxy = send(new URL(url.pathname + url.search, upstream), { method: req.method, headers }, response => {
      const safeHeaders = { 'Cache-Control': 'no-store' };
      for (const name of ['content-type', 'retry-after']) if (response.headers[name]) safeHeaders[name] = response.headers[name];
      res.writeHead(response.statusCode, safeHeaders);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    proxy.setTimeout(25000, () => proxy.destroy());
    proxy.on('error', () => fail(res, 503, 'API_UNAVAILABLE'));
    req.on('aborted', () => proxy.destroy());
    req.pipe(proxy);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, 'METHOD_NOT_ALLOWED');
  try {
    const candidate = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (candidate !== root && !candidate.startsWith(root + sep)) return fail(res, 404, 'NOT_FOUND');
    let file;
    try { file = await realpath(candidate); if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
    catch { if (extname(candidate)) return fail(res, 404, 'NOT_FOUND'); file = resolve(root, 'index.html'); }
    if (!file.startsWith(root + sep)) return fail(res, 404, 'NOT_FOUND');
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { fail(res, 400, 'INVALID_REQUEST'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Flutter workspace: http://127.0.0.1:${port}`));
