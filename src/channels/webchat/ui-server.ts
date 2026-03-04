import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, extname } from 'node:path';
import { readFile, stat, access } from 'node:fs/promises';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('webchat:ui');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export interface UiServerConfig {
  /** Port to listen on. */
  port: number;
  /** Path to the built UI directory (dist/control-ui/). */
  uiDir: string;
  /** WebSocket URL the UI should connect to (injected via bootstrap config). */
  wsUrl?: string;
  /** Assistant display name. */
  assistantName?: string;
}

/**
 * Creates an HTTP server that:
 * 1. Serves static files from the OpenPollen UI build directory
 * 2. Returns a bootstrap config at /__openpollen/control-ui-config.json
 * 3. Delegates WebSocket upgrades to the caller
 *
 * Returns the http.Server (caller wires up WSS upgrade).
 */
export function createUiHttpServer(config: UiServerConfig): Server {
  const { uiDir, assistantName } = config;

  // Check if UI directory exists at startup
  let uiBuilt = false;
  access(join(uiDir, 'index.html')).then(() => {
    uiBuilt = true;
  }).catch(() => {
    log.warn({ uiDir }, 'WebChat UI not built. Run "npm run build:ui" or "npm run build" to build it.');
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    // Bootstrap config endpoint
    if (url === '/__openpollen/control-ui-config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        assistantName: assistantName ?? 'OpenPollen',
        features: {},
      }));
      return;
    }

    // If UI is not built, show a helpful error page
    if (!uiBuilt) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>OpenPollen - UI Not Built</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
  .card{background:#1e293b;border-radius:12px;padding:40px;max-width:520px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.3)}
  h1{color:#60a5fa;margin-bottom:8px;font-size:1.5rem}
  p{color:#94a3b8;line-height:1.6}
  code{background:#334155;padding:2px 8px;border-radius:4px;font-size:.95em;color:#fbbf24}
  .steps{text-align:left;margin:20px 0}
  .steps li{margin:8px 0}
</style>
</head>
<body><div class="card">
  <h1>OpenPollen WebChat UI Not Built</h1>
  <p>The server is running, but the WebChat UI assets have not been built yet.</p>
  <div class="steps"><ol>
    <li>Stop the server (<code>Ctrl+C</code>)</li>
    <li>Run <code>npm run build</code></li>
    <li>Start again with <code>openpollen start</code></li>
  </ol></div>
  <p>Or build only the UI: <code>npm run build:ui</code></p>
</div></body></html>`);
      return;
    }

    // Static file serving
    await serveStatic(uiDir, url, res);
  });

  return server;
}

async function serveStatic(baseDir: string, urlPath: string, res: ServerResponse): Promise<void> {
  // Normalize path
  let filePath = urlPath.split('?')[0];
  if (filePath === '/' || filePath === '') filePath = '/index.html';

  // Security: prevent directory traversal
  const resolved = join(baseDir, filePath);
  if (!resolved.startsWith(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      // Try index.html in directory
      return serveStatic(baseDir, filePath + '/index.html', res);
    }

    const ext = extname(resolved);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const content = await readFile(resolved);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // SPA fallback: serve index.html for non-file paths
      if (!extname(filePath)) {
        try {
          const indexPath = join(baseDir, 'index.html');
          const content = await readFile(indexPath);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(content);
          return;
        } catch {
          // Fall through to 404
        }
      }
      res.writeHead(404);
      res.end('Not Found');
    } else {
      log.error({ error: err, path: filePath }, 'Static file error');
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
}
