import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { SkillManager } from '../../src/agent/skill-manager.js';
import type { Session } from '../../src/gateway/session.js';
import type { AppConfig } from '../../src/config/schema.js';

// Mock the Claude Agent SDK to be unavailable (so tests use API fallback)
vi.mock('@anthropic-ai/claude-code', () => {
  throw new Error('SDK not available');
});

function createMockConfig(): AppConfig {
  return {
    agent: {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 5,
      maxBudgetUsd: 0.5,
      defaultTools: ['Read', 'Grep'],
      defaultSkills: [],
    },
    gateway: {
      host: '127.0.0.1',
      port: 18800,
      auth: { mode: 'none' as const },
      session: { timeoutMinutes: 30, maxConcurrent: 50 },
    },
    channels: {},
    providers: {
      anthropic: {
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://api.anthropic.com',
      },
    },
    skills: { directory: '/tmp/hiveagent-test-skills', enabled: [] },
    memory: { backend: 'sqlite' as const, sqlitePath: '/tmp/test.db', fileDirectory: '/tmp/memory' },
    logging: { level: 'info' as const },
  };
}

function createMockSession(): Session {
  return {
    id: 'test-session',
    userId: 'test-user',
    channelType: 'webchat',
    channelId: 'webchat:dm:test-user',
    conversationType: 'dm',
    totalCostUsd: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    metadata: {},
  };
}

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let skillManager: SkillManager;

  beforeEach(() => {
    const config = createMockConfig();
    skillManager = new SkillManager(config.skills.directory);
    runner = new AgentRunner({ config, skillManager });
  });

  it('should create runner with config', () => {
    expect(runner).toBeDefined();
  });

  it('should handle API call when SDK is not available', async () => {
    const session = createMockSession();

    // Mock fetch for API call
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello from mock API' }],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const response = await runner.run(session, 'Hello');
    expect(response).toBe('Hello from mock API');

    vi.unstubAllGlobals();
  });

  it('should return error message when no provider is configured', async () => {
    const config = createMockConfig();
    config.providers = {};
    const emptyRunner = new AgentRunner({ config, skillManager });

    const session = createMockSession();
    const response = await emptyRunner.run(session, 'Hello');
    expect(response).toContain('未配置任何模型提供商');
  });
});
