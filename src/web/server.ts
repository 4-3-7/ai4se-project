/**
 * Seahorse Web UI Server — WebSocket + HTTP.
 * Serves the xterm.js terminal and relays I/O to the agent loop.
 * Corresponds to SPEC §3.10.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Start the Seahorse web server.
 */
export function startWebServer(port: number = 3000): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
      const filePath = join(PUBLIC_DIR, url);

      try {
        const content = readFileSync(filePath);
        const ext = filePath.slice(filePath.lastIndexOf('.'));
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
      console.log('🔌 WebSocket client connected');

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: '🐴 Seahorse Web Terminal',
        version: '0.1.0',
      }));

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          handleMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          }));
        }
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
      });
    });

    server.listen(port, () => {
      console.log(`🐴 Seahorse Web UI running at http://localhost:${port}`);
      resolve();
    });
  });
}

/**
 * Handle an incoming WebSocket message from the client.
 */
function handleMessage(ws: WebSocket, msg: Record<string, unknown>): void {
  switch (msg.type) {
    case 'input': {
      // Echo back for now — full agent loop integration via HITL callback
      const input = (msg.data as string) ?? '';

      // Simulate agent response
      ws.send(JSON.stringify({
        type: 'output',
        data: `> ${input}\n`,
      }));
      ws.send(JSON.stringify({
        type: 'output',
        data: `[Seahorse] Received: ${input}\n\n`,
      }));
      break;
    }
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }
    default: {
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${msg.type}`,
      }));
    }
  }
}