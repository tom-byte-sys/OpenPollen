import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { MemoryStore, MemoryEntry } from './interface.js';

const log = getLogger('memory-file');

/**
 * Markdown 文件记忆存储 (CLAUDE.md 风格)
 * 每个命名空间对应一个目录，每个 key 对应一个 .md 文件
 */
export class FileMemoryStore implements MemoryStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    log.info({ baseDir }, '文件记忆存储已初始化');
  }

  private getFilePath(namespace: string, key: string): string {
    const nsDir = resolve(this.baseDir, namespace);
    if (!existsSync(nsDir)) {
      mkdirSync(nsDir, { recursive: true });
    }
    return join(nsDir, `${this.sanitizeKey(key)}.md`);
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async get(namespace: string, key: string): Promise<string | null> {
    const filePath = this.getFilePath(namespace, key);
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    const parsed = this.parseFile(content);

    // 检查过期
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      unlinkSync(filePath);
      return null;
    }

    return parsed.value;
  }

  async set(namespace: string, key: string, value: string, ttl?: number): Promise<void> {
    const filePath = this.getFilePath(namespace, key);
    const now = Date.now();
    const expiresAt = ttl ? now + ttl * 1000 : undefined;

    const content = this.formatFile({
      key,
      value,
      namespace,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    writeFileSync(filePath, content, 'utf-8');
  }

  async delete(namespace: string, key: string): Promise<void> {
    const filePath = this.getFilePath(namespace, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async list(namespace: string, prefix?: string): Promise<MemoryEntry[]> {
    const nsDir = resolve(this.baseDir, namespace);
    if (!existsSync(nsDir)) return [];

    const files = readdirSync(nsDir).filter(f => f.endsWith('.md'));
    const entries: MemoryEntry[] = [];

    for (const file of files) {
      const filePath = join(nsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const parsed = this.parseFile(content);

      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        unlinkSync(filePath);
        continue;
      }

      if (prefix && !parsed.key.startsWith(prefix)) continue;

      entries.push({
        key: parsed.key,
        value: parsed.value,
        namespace,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        expiresAt: parsed.expiresAt,
      });
    }

    return entries;
  }

  async listNamespaces(prefix?: string): Promise<string[]> {
    if (!existsSync(this.baseDir)) return [];
    const dirs = readdirSync(this.baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    if (prefix) {
      return dirs.filter(d => d.startsWith(prefix));
    }
    return dirs;
  }

  async clear(namespace: string): Promise<void> {
    const nsDir = resolve(this.baseDir, namespace);
    if (existsSync(nsDir)) {
      rmSync(nsDir, { recursive: true, force: true });
      log.info({ namespace }, '文件记忆已清除');
    }
  }

  async close(): Promise<void> {
    // 文件存储无需关闭
  }

  private formatFile(entry: MemoryEntry): string {
    const lines = [
      '---',
      `key: ${entry.key}`,
      `createdAt: ${entry.createdAt}`,
      `updatedAt: ${entry.updatedAt}`,
    ];
    if (entry.expiresAt) {
      lines.push(`expiresAt: ${entry.expiresAt}`);
    }
    lines.push('---', '', entry.value);
    return lines.join('\n');
  }

  private parseFile(content: string): MemoryEntry {
    const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!match) {
      return {
        key: 'unknown',
        value: content,
        namespace: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    const meta: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }

    return {
      key: meta['key'] ?? 'unknown',
      value: match[2],
      namespace: '',
      createdAt: parseInt(meta['createdAt'] ?? '0', 10),
      updatedAt: parseInt(meta['updatedAt'] ?? '0', 10),
      expiresAt: meta['expiresAt'] ? parseInt(meta['expiresAt'], 10) : undefined,
    };
  }
}
