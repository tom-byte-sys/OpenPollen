import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteMemoryStore } from '../../src/memory/sqlite-store.js';
import { FileMemoryStore } from '../../src/memory/file-store.js';
import type { MemoryStore } from '../../src/memory/interface.js';

const TEST_DIR = resolve('/tmp/hiveagent-test-memory');

interface StoreFactory {
  name: string;
  create: () => Promise<MemoryStore>;
}

const stores: StoreFactory[] = [
  {
    name: 'SqliteMemoryStore',
    create: async () => {
      const store = new SqliteMemoryStore(resolve(TEST_DIR, 'sqlite', 'test.db'));
      await store.init();
      return store;
    },
  },
  {
    name: 'FileMemoryStore',
    create: async () => {
      return new FileMemoryStore(resolve(TEST_DIR, 'file'));
    },
  },
];

for (const factory of stores) {
  describe(factory.name, () => {
    let store: MemoryStore;

    beforeEach(async () => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
      store = await factory.create();
    });

    afterEach(async () => {
      await store.close();
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('get non-existent key returns null', async () => {
      const result = await store.get('ns', 'missing-key');
      expect(result).toBeNull();
    });

    it('set and get basic read/write', async () => {
      await store.set('ns', 'key1', 'value1');
      const result = await store.get('ns', 'key1');
      expect(result).toBe('value1');
    });

    it('overwrite existing key', async () => {
      await store.set('ns', 'key1', 'original');
      await store.set('ns', 'key1', 'updated');
      const result = await store.get('ns', 'key1');
      expect(result).toBe('updated');
    });

    it('namespace isolation', async () => {
      await store.set('ns-a', 'key1', 'value-a');
      await store.set('ns-b', 'key1', 'value-b');
      expect(await store.get('ns-a', 'key1')).toBe('value-a');
      expect(await store.get('ns-b', 'key1')).toBe('value-b');
    });

    it('delete removes a key', async () => {
      await store.set('ns', 'key1', 'value1');
      await store.delete('ns', 'key1');
      const result = await store.get('ns', 'key1');
      expect(result).toBeNull();
    });

    it('delete non-existent key does not throw', async () => {
      await expect(store.delete('ns', 'no-such-key')).resolves.toBeUndefined();
    });

    it('list entries in namespace', async () => {
      await store.set('ns', 'a', '1');
      await store.set('ns', 'b', '2');
      await store.set('ns', 'c', '3');
      const entries = await store.list('ns');
      const keys = entries.map(e => e.key).sort();
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('list with prefix filter', async () => {
      await store.set('ns', 'user:1', 'Alice');
      await store.set('ns', 'user:2', 'Bob');
      await store.set('ns', 'session:1', 'data');
      const entries = await store.list('ns', 'user:');
      const keys = entries.map(e => e.key).sort();
      expect(keys).toEqual(['user:1', 'user:2']);
    });

    it('list on empty namespace returns empty array', async () => {
      const entries = await store.list('empty-ns');
      expect(entries).toEqual([]);
    });

    it('clear removes all entries in namespace without affecting others', async () => {
      await store.set('ns-a', 'k1', 'v1');
      await store.set('ns-a', 'k2', 'v2');
      await store.set('ns-b', 'k1', 'v1');

      await store.clear('ns-a');

      expect(await store.get('ns-a', 'k1')).toBeNull();
      expect(await store.get('ns-a', 'k2')).toBeNull();
      expect(await store.get('ns-b', 'k1')).toBe('v1');
    });

    it('TTL expiration', async () => {
      await store.set('ns', 'ephemeral', 'temp-value', 1); // 1 second TTL
      expect(await store.get('ns', 'ephemeral')).toBe('temp-value');

      await new Promise(r => setTimeout(r, 1200));

      expect(await store.get('ns', 'ephemeral')).toBeNull();
    });

    it('expired entries do not appear in list', async () => {
      await store.set('ns', 'persistent', 'stays');
      await store.set('ns', 'ephemeral', 'goes', 1); // 1 second TTL

      await new Promise(r => setTimeout(r, 1200));

      const entries = await store.list('ns');
      const keys = entries.map(e => e.key);
      expect(keys).toContain('persistent');
      expect(keys).not.toContain('ephemeral');
    });

    it('handles special characters in values', async () => {
      const specialValues = [
        'line1\nline2\nline3',
        '中文内容测试',
        'emoji: 🐝🎉🚀',
        'mixed: hello 世界 🌍\nnewline',
      ];

      for (let i = 0; i < specialValues.length; i++) {
        await store.set('ns', `special-${i}`, specialValues[i]);
        const result = await store.get('ns', `special-${i}`);
        expect(result).toBe(specialValues[i]);
      }
    });
  });
}
