import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { setupConnection, getDocCount, getConnectionCount } from './wsUtils.js';
import { createPersistence } from './persistence.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 1234);

// Optional comma-separated allowlist of browser origins. Empty = allow all
// (convenient for local dev). Set it in production, e.g.
//   ALLOWED_ORIGINS="https://board.example.com"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const MAX_ROOM_NAME_LENGTH = 120;

function roomNameFromUrl(url: string | undefined): string | null {
    if (!url) return null;
    // Path is the room, e.g. ws://host:1234/my-board -> "my-board"
    const path = decodeURIComponent(url.split('?')[0]).replace(/^\/+/, '').trim();
    if (!path) return 'default-room';
    if (path.length > MAX_ROOM_NAME_LENGTH) return null;
    // Restrict to a safe, filesystem-friendly character set (also guards LevelDB keys).
    if (!/^[A-Za-z0-9_\-./]+$/.test(path)) return null;
    return path;
}

function originAllowed(origin: string | undefined): boolean {
    if (ALLOWED_ORIGINS.length === 0) return true;
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

async function main() {
    const persistence = await createPersistence();

    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    rooms: getDocCount(),
                    connections: getConnectionCount(),
                    uptime: process.uptime(),
                }),
            );
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    });

    // noServer: we handle the upgrade manually so we can validate origin/room first.
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws: WebSocket, room: string) => {
        setupConnection(ws, room, persistence).catch((err) => {
            console.error('[ws] setup failed:', err);
            try {
                ws.close();
            } catch {
                /* noop */
            }
        });
    });

    server.on('upgrade', (req, socket, head) => {
        if (!originAllowed(req.headers.origin)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        const room = roomNameFromUrl(req.url);
        if (!room) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, room);
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`[whiteboard] websocket server listening on ws://${HOST}:${PORT}`);
        console.log(
            `[whiteboard] persistence: ${persistence ? 'LevelDB' : 'in-memory'} | origins: ${
                ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : 'all'
            }`,
        );
    });

    const shutdown = (signal: string) => {
        console.log(`\n[whiteboard] received ${signal}, shutting down...`);
        wss.clients.forEach((c) => c.close());
        server.close(() => process.exit(0));
        // Force-exit if connections linger.
        setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    console.error('[whiteboard] fatal:', err);
    process.exit(1);
});
