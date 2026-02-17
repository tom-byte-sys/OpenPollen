import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, extname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
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
 * 1. Serves static files from the HiveAgent UI build directory
 * 2. Returns a bootstrap config at /__hiveagent/control-ui-config.json
 * 3. Delegates WebSocket upgrades to the caller
 *
 * Returns the http.Server (caller wires up WSS upgrade).
 */
export function createUiHttpServer(config: UiServerConfig): Server {
  const { uiDir, assistantName } = config;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    // Bootstrap config endpoint
    if (url === '/__hiveagent/control-ui-config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        assistantName: assistantName ?? 'HiveAgent',
        features: {},
      }));
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
