// @ts-expect-error sql.js has no type declarations
import initSqlJs, { type Database } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { MemoryStore, MemoryEntry } from './interface.js';

const log = getLogger('memory-sqlite');

export class SqliteMemoryStore implements MemoryStore {
  private db!: Database;
  private dbPath: string;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * 异步初始化（sql.js 需要异步加载 WASM）
   */
  async init(): Promise<void> {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initSchema();
    this.startGC();

    log.info({ dbPath: this.dbPath }, 'SQLite 记忆存储已初始化');
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        PRIMARY KEY (namespace, key)
      )
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory(namespace)');
  }

  private persist(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  async get(namespace: string, key: string): Promise<string | null> {
    const stmt = this.db.prepare(
      'SELECT value, expires_at FROM memory WHERE namespace = ? AND key = ?',
    );
    stmt.bind([namespace, key]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as { value: string; expires_at: number | null };
    stmt.free();

    if (row.expires_at && row.expires_at < Date.now()) {
      this.db.run('DELETE FROM memory WHERE namespace = ? AND key = ?', [namespace, key]);
      this.persist();
      return null;
    }

    return row.value;
  }

  async set(namespace: string, key: string, value: string, ttl?: number): Promise<void> {
    const now = Date.now();
    const expiresAt = ttl ? now + ttl * 1000 : null;

    this.db.run(`
      INSERT OR REPLACE INTO memory (namespace, key, value, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [namespace, key, value, now, now, expiresAt]);

    this.persist();
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.db.run('DELETE FROM memory WHERE namespace = ? AND key = ?', [namespace, key]);
    this.persist();
  }

  async list(namespace: string, prefix?: string): Promise<MemoryEntry[]> {
    const now = Date.now();
    let stmt;

    if (prefix) {
      stmt = this.db.prepare(
        'SELECT * FROM memory WHERE namespace = ? AND key LIKE ? AND (expires_at IS NULL OR expires_at > ?)',
      );
      stmt.bind([namespace, `${prefix}%`, now]);
    } else {
      stmt = this.db.prepare(
        'SELECT * FROM memory WHERE namespace = ? AND (expires_at IS NULL OR expires_at > ?)',
      );
      stmt.bind([namespace, now]);
    }

    const entries: MemoryEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        key: string;
        value: string;
        namespace: string;
        metadata: string;
        created_at: number;
        updated_at: number;
        expires_at: number | null;
      };
      entries.push({
        key: row.key,
        value: row.value,
        namespace: row.namespace,
        metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at ?? undefined,
      });
    }
    stmt.free();

    return entries;
  }

  async listNamespaces(prefix?: string): Promise<string[]> {
    const now = Date.now();
    let stmt;
    if (prefix) {
      stmt = this.db.prepare(
        'SELECT DISTINCT namespace FROM memory WHERE namespace LIKE ? AND (expires_at IS NULL OR expires_at > ?)',
      );
      stmt.bind([`${prefix}%`, now]);
    } else {
      stmt = this.db.prepare(
        'SELECT DISTINCT namespace FROM memory WHERE (expires_at IS NULL OR expires_at > ?)',
      );
      stmt.bind([now]);
    }

    const namespaces: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { namespace: string };
      namespaces.push(row.namespace);
    }
    stmt.free();
    return namespaces;
  }

  async clear(namespace: string): Promise<void> {
    this.db.run('DELETE FROM memory WHERE namespace = ?', [namespace]);
    this.persist();
    log.info({ namespace }, '记忆已清除');
  }

  async close(): Promise<void> {
    this.stopGC();
    this.persist();
    this.db.close();
    log.info('SQLite 记忆存储已关闭');
  }

  private startGC(intervalMs = 300_000): void {
    this.gcTimer = setInterval(() => {
      const before = this.db.getRowsModified();
      this.db.run(
        'DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < ?',
        [Date.now()],
      );
      const removed = this.db.getRowsModified() - before;
      if (removed > 0) {
        this.persist();
        log.debug({ removed }, '过期记忆已清理');
      }
    }, intervalMs);
  }

  private stopGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }
}
