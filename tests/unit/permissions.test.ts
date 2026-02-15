import { describe, it, expect } from 'vitest';
import { createPermissionHandler, parseAllowedTools } from '../../src/agent/permissions.js';
import type { Session } from '../../src/gateway/session.js';

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

describe('Permissions', () => {
  describe('createPermissionHandler', () => {
    it('should allow default safe tools', () => {
      const session = createMockSession();
      const handler = createPermissionHandler(session);

      expect(handler({ tool: 'Read', input: {} })).toBe(true);
      expect(handler({ tool: 'Grep', input: {} })).toBe(true);
      expect(handler({ tool: 'Glob', input: {} })).toBe(true);
      expect(handler({ tool: 'WebSearch', input: {} })).toBe(true);
      expect(handler({ tool: 'WebFetch', input: {} })).toBe(true);
      expect(handler({ tool: 'Skill', input: {} })).toBe(true);
    });

    it('should deny dangerous tools by default', () => {
      const session = createMockSession();
      const handler = createPermissionHandler(session);

      expect(handler({ tool: 'Bash', input: { command: 'rm -rf /' } })).toBe(false);
      expect(handler({ tool: 'Write', input: {} })).toBe(false);
      expect(handler({ tool: 'Edit', input: {} })).toBe(false);
    });

    it('should allow additional tools when specified', () => {
      const session = createMockSession();
      const handler = createPermissionHandler(session, [{ tool: 'Bash' }]);

      expect(handler({ tool: 'Bash', input: { command: 'ls' } })).toBe(true);
    });

    it('should deny unknown tools', () => {
      const session = createMockSession();
      const handler = createPermissionHandler(session);

      expect(handler({ tool: 'UnknownTool', input: {} })).toBe(false);
    });
  });

  describe('parseAllowedTools', () => {
    it('should parse simple tool names', () => {
      const rules = parseAllowedTools('Read, Grep, Glob');
      expect(rules).toEqual([
        { tool: 'Read' },
        { tool: 'Grep' },
        { tool: 'Glob' },
      ]);
    });

    it('should parse tools with patterns', () => {
      const rules = parseAllowedTools('Read, Bash(git diff *)');
      expect(rules).toEqual([
        { tool: 'Read' },
        { tool: 'Bash', pattern: 'git diff *' },
      ]);
    });

    it('should handle empty string', () => {
      const rules = parseAllowedTools('');
      expect(rules).toEqual([]);
    });
  });
});
