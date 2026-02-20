import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  eventFrame,
  okResponse,
  errorResponse,
  isRequestFrame,
  type ConnectParams,
  type ChallengePayload,
  type HelloOkPayload,
  type RequestFrame,
} from './protocol.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('webchat:handshake');

/** All RPC methods the server advertises. */
const SUPPORTED_METHODS = [
  'chat.send',
  'chat.history',
  'chat.abort',
  'sessions.list',
  'sessions.patch',
  'sessions.delete',
  'health',
  'status',
  'config.get',
  'config.schema',
  'config.set',
  'config.apply',
  'skills.status',
  'models.list',
  'last-heartbeat',
  'logs.tail',
  'agents.list',
  'agents.files.list',
  'agent.identity.get',
  'channels.status',
  'cron.list',
  'cron.status',
  'cron.add',
  'cron.update',
  'cron.run',
  'cron.remove',
  'cron.runs',
  'sessions.usage',
  'sessions.usage.timeseries',
  'sessions.usage.logs',
  'usage.cost',
];

const SUPPORTED_EVENTS = ['chat', 'tick', 'cron'];

/**
 * Runs the OpenPollen handshake on a newly-connected WebSocket.
 * Returns the connection ID on success, or null if handshake fails.
 *
 * Flow:
 *   ← server sends connect.challenge event
 *   → client sends connect request
 *   ← server responds with hello-ok
 */
export function performHandshake(
  ws: WebSocket,
  serverVersion: string,
): Promise<{ connId: string; deviceId: string | null; onFirstRequest: (handler: (frame: RequestFrame) => void) => void }> {
  return new Promise((resolve, reject) => {
    const connId = randomUUID();
    const nonce = randomUUID();
    let settled = false;
    // Buffer for any request frames received after handshake but before handler is set
    let bufferedFrame: RequestFrame | null = null;
    let requestHandler: ((frame: RequestFrame) => void) | null = null;

    // Timeout: if client doesn't complete handshake within 10s, close
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close(4001, 'Handshake timeout');
        reject(new Error('Handshake timeout'));
      }
    }, 10_000);

    // 1. Send challenge
    const challenge: ChallengePayload = { nonce, ts: Date.now() };
    ws.send(JSON.stringify(eventFrame('connect.challenge', challenge)));

    // 2. Wait for connect request
    const onMessage = (data: Buffer | string) => {
      try {
        const raw = JSON.parse(typeof data === 'string' ? data : data.toString());

        if (!isRequestFrame(raw)) return;

        if (raw.method === 'connect') {
          const params = (raw.params ?? {}) as ConnectParams;

          // Validate protocol version
          const minP = params.minProtocol ?? 3;
          const maxP = params.maxProtocol ?? 3;
          if (PROTOCOL_VERSION < minP || PROTOCOL_VERSION > maxP) {
            ws.send(JSON.stringify(errorResponse(raw.id, 'VERSION_MISMATCH', `Server protocol ${PROTOCOL_VERSION} not in range [${minP}, ${maxP}]`)));
            ws.close(4002, 'Protocol version mismatch');
            settled = true;
            clearTimeout(timer);
            reject(new Error('Protocol version mismatch'));
            return;
          }

          // Accept connection
          const helloOk: HelloOkPayload = {
            protocol: PROTOCOL_VERSION,
            server: { version: serverVersion, connId },
            features: {
              methods: SUPPORTED_METHODS,
              events: SUPPORTED_EVENTS,
            },
          };

          ws.send(JSON.stringify(okResponse(raw.id, helloOk)));

          settled = true;
          clearTimeout(timer);

          // Replace the handshake message listener with a passthrough to the dispatcher
          ws.removeListener('message', onMessage);
          ws.on('message', (msgData: Buffer | string) => {
            try {
              const frame = JSON.parse(typeof msgData === 'string' ? msgData : msgData.toString());
              if (isRequestFrame(frame)) {
                if (requestHandler) {
                  requestHandler(frame);
                } else {
                  bufferedFrame = frame;
                }
              }
            } catch {
              // Ignore malformed frames post-handshake
            }
          });

          const deviceId = typeof params.device?.id === 'string' && params.device.id ? params.device.id : null;
          log.info({ connId, deviceId }, 'WebChat handshake completed');
          resolve({
            connId,
            deviceId,
            onFirstRequest: (handler) => {
              requestHandler = handler;
              if (bufferedFrame) {
                handler(bufferedFrame);
                bufferedFrame = null;
              }
            },
          });
        }
      } catch (err) {
        log.warn({ error: err }, 'Malformed frame during handshake');
      }
    };

    ws.on('message', onMessage);

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Connection closed during handshake'));
      }
    });
  });
}
