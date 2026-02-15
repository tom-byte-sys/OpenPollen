import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner.js';
import { MessageRouter } from '../../src/gateway/router.js';
import { SessionManager } from '../../src/gateway/session.js';
import { SkillManager } from '../../src/agent/skill-manager.js';
import type { Session } from '../../src/gateway/session.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { MemoryStore, MemoryEntry } from '../../src/memory/interface.js';
import type { InboundMessage } from '../../src/channels/interface.js';

// Mock SDK with controllable behavior
const mockQueryResult = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (params: { prompt: string; options?: Record<string, unknown> }) => {
    return mockQueryResult(params);
  },
}));

function createConfig(): AppConfig {
  return {
    agent: {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 5,
      maxBudgetUsd: 0.5,
      defaultTools: ['Read'],
      defaultSkills: [],
      systemPrompt: 'You are a helpful assistant.',
    },
    gateway: {
      host: '127.0.0.1',
      port: 0,
      auth: { mode: 'none' as const },
      session: { timeoutMinutes: 30, maxConcurrent: 50 },
    },
    channels: {},
    providers: {},
    skills: { directory: '/tmp/hiveagent-mem-test-skills', enabled: [] },
    memory: { backend: 'sqlite' as const, sqlitePath: '/tmp/mem-test.db', fileDirectory: '/tmp/mem-test' },
    logging: { level: 'error' as const },
  };
}

function createMockMemory(): MemoryStore & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function createSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-session',
    userId: 'user-123',
    channelType: 'webchat',
    channelId: 'webchat:dm:user-123',
    conversationType: 'dm',
    totalCostUsd: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    metadata: {},
    ...overrides,
  };
}

function createInboundMessage(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    id: 'msg-1',
    channelType: 'webchat',
    channelId: 'webchat:dm:user-123',
    senderId: 'user-123',
    senderName: 'Test User',
    conversationType: 'dm',
    content: { type: 'text', text: 'Hello' },
    timestamp: Date.now(),
    ...overrides,
  };
}

// Helper to create an async generator from messages
async function* makeSDKStream(messages: Array<Record<string, unknown>>): AsyncGenerator<Record<string, unknown>, void> {
  for (const msg of messages) {
    yield msg;
  }
}

describe('Memory Integration', () => {
  let memory: ReturnType<typeof createMockMemory>;

  beforeEach(() => {
    memory = createMockMemory();
    mockQueryResult.mockReset();
  });

  describe('SDK Session ID Persistence (Layer 1)', () => {
    it('should restore SDK session ID from memory on run', async () => {
      memory.get.mockResolvedValue('saved-sdk-session-abc');

      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'saved-sdk-session-abc', total_cost_usd: 0.01, result: 'Hello!' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession({ sdkSessionId: undefined });
      await runner.run(session, 'Hi');

      // Should have tried to restore from memory
      expect(memory.get).toHaveBeenCalledWith('sdk-sessions', 'webchat:dm:user-123');
      // Session should have the restored ID
      expect(session.sdkSessionId).toBe('saved-sdk-session-abc');
    });

    it('should persist SDK session ID to memory after SDK returns', async () => {
      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'new-session-xyz', total_cost_usd: 0.01, result: 'Hi there!' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession();
      await runner.run(session, 'Hello');

      // Should have persisted the new session ID
      expect(memory.set).toHaveBeenCalledWith('sdk-sessions', 'webchat:dm:user-123', 'new-session-xyz');
    });

    it('should not restore from memory if session already has sdkSessionId', async () => {
      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'existing-session', total_cost_usd: 0.01, result: 'OK' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession({ sdkSessionId: 'existing-session' });
      await runner.run(session, 'Hello');

      // Should NOT have queried memory for restore
      expect(memory.get).not.toHaveBeenCalledWith('sdk-sessions', expect.anything());
    });
  });

  describe('User Context Injection (Layer 2)', () => {
    it('should load user context when no SDK session to resume', async () => {
      const entries: MemoryEntry[] = [
        { key: 'summary:1000', value: 'Q: What is TypeScript? → A: TypeScript is a typed superset of JavaScript', namespace: 'user:user-123', createdAt: 1000, updatedAt: 1000 },
        { key: 'summary:2000', value: 'Q: How to use generics? → A: Generics allow type parameters', namespace: 'user:user-123', createdAt: 2000, updatedAt: 2000 },
      ];
      memory.list.mockResolvedValue(entries);

      let capturedOptions: Record<string, unknown> = {};
      mockQueryResult.mockImplementation((params: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = params.options ?? {};
        return makeSDKStream([
          { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
          { type: 'result', session_id: 'new-session', total_cost_usd: 0.01, result: 'Response' },
        ]);
      });

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession();
      await runner.run(session, 'Hello');

      // Should have loaded user context
      expect(memory.list).toHaveBeenCalledWith('user:user-123');

      // System prompt should contain user context
      const systemPrompt = capturedOptions['systemPrompt'] as { append: string };
      expect(systemPrompt.append).toContain('用户历史对话摘要');
      expect(systemPrompt.append).toContain('What is TypeScript');
    });

    it('should not inject user context when resuming SDK session', async () => {
      memory.get.mockResolvedValue('existing-sdk-session');

      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'existing-sdk-session', total_cost_usd: 0.01, result: 'OK' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession();
      await runner.run(session, 'Hello');

      // Should NOT have loaded user context (SDK session was restored)
      expect(memory.list).not.toHaveBeenCalledWith('user:user-123');
    });

    it('should limit user context to 5 most recent entries', async () => {
      const entries: MemoryEntry[] = Array.from({ length: 8 }, (_, i) => ({
        key: `summary:${i * 1000}`,
        value: `Q: Question ${i} → A: Answer ${i}`,
        namespace: 'user:user-123',
        createdAt: i * 1000,
        updatedAt: i * 1000,
      }));
      memory.list.mockResolvedValue(entries);

      let capturedOptions: Record<string, unknown> = {};
      mockQueryResult.mockImplementation((params: { prompt: string; options?: Record<string, unknown> }) => {
        capturedOptions = params.options ?? {};
        return makeSDKStream([
          { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
          { type: 'result', session_id: 'new', total_cost_usd: 0.01, result: 'OK' },
        ]);
      });

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });

      const session = createSession();
      await runner.run(session, 'Hello');

      const systemPrompt = capturedOptions['systemPrompt'] as { append: string };
      // Should contain the 5 most recent (7, 6, 5, 4, 3) but not 0, 1, 2
      expect(systemPrompt.append).toContain('Question 7');
      expect(systemPrompt.append).toContain('Question 3');
      expect(systemPrompt.append).not.toContain('Question 2');
    });
  });

  describe('Conversation Summary Storage (Router)', () => {
    it('should store conversation summary after agent response', async () => {
      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'sess-1', total_cost_usd: 0.01, result: 'This is the answer' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });
      const sessionManager = new SessionManager({
        timeoutMinutes: 30,
        maxConcurrent: 50,
      });
      const router = new MessageRouter({ sessionManager, agentRunner: runner, memory });

      const msg = createInboundMessage();
      await router.handleMessage(msg);

      // Should have stored a summary
      const setCalls = memory.set.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).startsWith('user:'),
      );
      expect(setCalls.length).toBeGreaterThanOrEqual(1);
      const summaryCall = setCalls[setCalls.length - 1];
      expect(summaryCall[0]).toBe('user:user-123');
      expect(summaryCall[1]).toMatch(/^summary:\d+$/);
      expect(summaryCall[2]).toContain('Q: Hello');
      expect(summaryCall[2]).toContain('A: This is the answer');
      expect(summaryCall[3]).toBe(604800); // 7 day TTL
    });

    it('should truncate question to 100 chars and answer to 200 chars in summary', async () => {
      const longQuestion = 'x'.repeat(200);
      const longAnswer = 'y'.repeat(500);

      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'sess-1', total_cost_usd: 0.01, result: longAnswer },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });
      const sessionManager = new SessionManager({
        timeoutMinutes: 30,
        maxConcurrent: 50,
      });
      const router = new MessageRouter({ sessionManager, agentRunner: runner, memory });

      const msg = createInboundMessage({
        content: { type: 'text', text: longQuestion },
      });
      await router.handleMessage(msg);

      const setCalls = memory.set.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).startsWith('user:'),
      );
      const summary = setCalls[setCalls.length - 1][2] as string;
      // Q part: "Q: " + 100 chars; A part: " → A: " + 200 chars
      expect(summary.indexOf('Q: ')).toBe(0);
      const qPart = summary.split(' → A: ')[0].slice(3); // after "Q: "
      const aPart = summary.split(' → A: ')[1];
      expect(qPart.length).toBe(100);
      expect(aPart.length).toBe(200);
    });

    it('should keep only 5 most recent summaries per user', async () => {
      // Simulate 7 existing entries
      const existingEntries: MemoryEntry[] = Array.from({ length: 7 }, (_, i) => ({
        key: `summary:${i * 1000}`,
        value: `Q: Q${i} → A: A${i}`,
        namespace: 'user:user-123',
        createdAt: i * 1000,
        updatedAt: i * 1000,
      }));

      // First call to list (from runner's loadUserContext) returns empty
      // Second call to list (from router's storeConversationSummary) returns 7 entries
      memory.list
        .mockResolvedValueOnce([])  // loadUserContext
        .mockResolvedValueOnce(existingEntries);  // storeConversationSummary (after adding new one, 7 total > 5)

      mockQueryResult.mockReturnValue(makeSDKStream([
        { type: 'system', subtype: 'init', model: 'test', tools: [], skills: [] },
        { type: 'result', session_id: 'sess-1', total_cost_usd: 0.01, result: 'Reply' },
      ]));

      const config = createConfig();
      const skillManager = new SkillManager(config.skills.directory);
      const runner = new AgentRunner({ config, skillManager, memory });
      const sessionManager = new SessionManager({
        timeoutMinutes: 30,
        maxConcurrent: 50,
      });
      const router = new MessageRouter({ sessionManager, agentRunner: runner, memory });

      await router.handleMessage(createInboundMessage());

      // Should have deleted the 2 oldest entries (7 - 5 = 2)
      const deleteCalls = memory.delete.mock.calls.filter(
        (call: unknown[]) => (call[0] as string).startsWith('user:'),
      );
      expect(deleteCalls.length).toBe(2);
      // Oldest entries should be deleted first
      expect(deleteCalls[0][1]).toBe('summary:0');
      expect(deleteCalls[1][1]).toBe('summary:1000');
    });
  });
});
