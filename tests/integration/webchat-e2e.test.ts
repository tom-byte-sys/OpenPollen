import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { SessionManager } from '../../src/gateway/session.js';
import { MessageRouter } from '../../src/gateway/router.js';
import { AgentRunner } from '../../src/agent/runner.js';
import { SkillManager } from '../../src/agent/skill-manager.js';
import { GatewayServer } from '../../src/gateway/server.js';
import type { AppConfig } from '../../src/config/schema.js';

// Mock SDK unavailable (force API fallback mode in tests)
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  throw new Error('SDK not available');
});

// 保存真实 fetch
const realFetch = globalThis.fetch;

function createTestConfig(): AppConfig {
  return {
    agent: {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 5,
      maxBudgetUsd: 0.5,
      defaultTools: ['Read'],
      defaultSkills: [],
    },
    gateway: {
      host: '127.0.0.1',
      port: 0,
      auth: { mode: 'none' as const },
      session: { timeoutMinutes: 30, maxConcurrent: 50 },
    },
    channels: {},
    providers: {
      anthropic: {
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'http://127.0.0.1:19999',
      },
    },
    skills: { directory: '/tmp/hiveagent-e2e-skills', enabled: [] },
    memory: { backend: 'sqlite' as const, sqlitePath: '/tmp/e2e-test.db', fileDirectory: '/tmp/e2e-memory' },
    logging: { level: 'error' as const },
  };
}

describe('WebChat E2E', () => {
  let gateway: GatewayServer;
  let sessionManager: SessionManager;
  let gatewayPort: number;

  beforeEach(async () => {
    const config = createTestConfig();
    const skillManager = new SkillManager(config.skills.directory);
    const agentRunner = new AgentRunner({ config, skillManager });
    sessionManager = new SessionManager({
      timeoutMinutes: config.gateway.session.timeoutMinutes,
      maxConcurrent: config.gateway.session.maxConcurrent,
    });
    const router = new MessageRouter({ sessionManager, agentRunner });
    gateway = new GatewayServer({ config: config.gateway, router });

    await gateway.start();

    // 获取实际分配的端口
    const server = (gateway as unknown as { httpServer: Server }).httpServer;
    const address = server.address();
    gatewayPort = typeof address === 'object' && address ? address.port : 18800;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await gateway.stop();
    sessionManager.stopGC();
  });

  it('should respond to health check', async () => {
    const res = await realFetch(`http://127.0.0.1:${gatewayPort}/health`);
    const data = await res.json() as { status: string };
    expect(data.status).toBe('ok');
  });

  it('should respond to status check', async () => {
    const res = await realFetch(`http://127.0.0.1:${gatewayPort}/api/status`);
    const data = await res.json() as { status: string; activeSessions: number };
    expect(data.status).toBe('running');
    expect(data.activeSessions).toBe(0);
  });

  it('should handle chat message via HTTP API', async () => {
    // Mock 掉 agentRunner 内部调用的 API (Anthropic Messages API)
    const mockApiResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'E2E test response' }],
      }),
      text: async () => '',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/v1/messages')) {
        return Promise.resolve(mockApiResponse);
      }
      return realFetch(url, init);
    }));

    const res = await realFetch(`http://127.0.0.1:${gatewayPort}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello', userId: 'e2e-user' }),
    });

    const data = await res.json() as { response: string };
    expect(res.status).toBe(200);
    expect(data.response).toBe('E2E test response');
  });

  it('should reject chat without message field', async () => {
    const res = await realFetch(`http://127.0.0.1:${gatewayPort}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'e2e-user' }),
    });

    const data = await res.json() as { error: string };
    expect(res.status).toBe(400);
    expect(data.error).toContain('message');
  });

  it('should return 404 for unknown routes', async () => {
    const res = await realFetch(`http://127.0.0.1:${gatewayPort}/unknown`);
    expect(res.status).toBe(404);
  });
});
