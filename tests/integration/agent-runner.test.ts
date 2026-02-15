import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { SkillManager } from '../../src/agent/skill-manager.js';
import type { Session } from '../../src/gateway/session.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { MemoryStore } from '../../src/memory/interface.js';

// Mock the Claude Agent SDK to be unavailable
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
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

function createMockMemory(): MemoryStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
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
  let memory: MemoryStore;

  beforeEach(() => {
    const config = createMockConfig();
    skillManager = new SkillManager(config.skills.directory);
    memory = createMockMemory();
    runner = new AgentRunner({ config, skillManager, memory });
  });

  it('should create runner with config', () => {
    expect(runner).toBeDefined();
  });

  it('should throw when SDK is not available', async () => {
    const session = createMockSession();

    await expect(runner.run(session, 'Hello')).rejects.toThrow('Claude Agent SDK 加载失败');
  });
});
