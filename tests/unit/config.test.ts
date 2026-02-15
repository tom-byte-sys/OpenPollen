import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, expandHome } from '../../src/config/loader.js';

const TEST_DIR = resolve('/tmp/hiveagent-test-config');

describe('Config Loader', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('should load default config when no file exists', () => {
    // Should throw because explicit path doesn't exist
    expect(() => loadConfig('/nonexistent/path/hiveagent.json')).toThrow('配置文件不存在');
  });

  it('should load and parse JSON5 config', () => {
    const configPath = resolve(TEST_DIR, 'hiveagent.json');
    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: 'claude-haiku-4-20250514',
        maxTurns: 5,
        maxBudgetUsd: 0.5,
        defaultTools: ['Read'],
        defaultSkills: [],
      },
      gateway: {
        host: '0.0.0.0',
        port: 9999,
        auth: { mode: 'none' },
        session: { timeoutMinutes: 10, maxConcurrent: 20 },
      },
      channels: {},
      providers: {},
      skills: { directory: '/tmp/skills', enabled: [] },
      memory: { backend: 'sqlite', sqlitePath: '/tmp/test.db', fileDirectory: '/tmp/memory' },
      logging: { level: 'debug' },
    }));

    const config = loadConfig(configPath);
    expect(config.agent.model).toBe('claude-haiku-4-20250514');
    expect(config.agent.maxTurns).toBe(5);
    expect(config.gateway.port).toBe(9999);
    expect(config.logging.level).toBe('debug');
  });

  it('should substitute environment variables', () => {
    process.env['TEST_HIVEAGENT_KEY'] = 'test-key-123';

    const configPath = resolve(TEST_DIR, 'hiveagent.json');
    writeFileSync(configPath, JSON.stringify({
      agent: { model: 'claude-sonnet-4-20250514', maxTurns: 15, maxBudgetUsd: 1.0, defaultTools: [], defaultSkills: [] },
      gateway: { host: '127.0.0.1', port: 18800, auth: { mode: 'none' }, session: { timeoutMinutes: 30, maxConcurrent: 50 } },
      channels: {},
      providers: { anthropic: { enabled: true, apiKey: '${TEST_HIVEAGENT_KEY}' } },
      skills: { directory: '/tmp/skills', enabled: [] },
      memory: { backend: 'sqlite', sqlitePath: '/tmp/test.db', fileDirectory: '/tmp/memory' },
      logging: { level: 'info' },
    }));

    const config = loadConfig(configPath);
    expect(config.providers.anthropic?.apiKey).toBe('test-key-123');

    delete process.env['TEST_HIVEAGENT_KEY'];
  });

  it('should expand ~ in paths', () => {
    expect(expandHome('~/foo/bar')).toMatch(/\/foo\/bar$/);
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
  });
});
