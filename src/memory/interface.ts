export interface MemoryEntry {
  key: string;
  value: string;
  namespace: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface MemoryStore {
  get(namespace: string, key: string): Promise<string | null>;
  set(namespace: string, key: string, value: string, ttl?: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list(namespace: string, prefix?: string): Promise<MemoryEntry[]>;
  listNamespaces(prefix?: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
  close(): Promise<void>;
}
