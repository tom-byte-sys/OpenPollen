import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/gateway/session.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({ timeoutMinutes: 1, maxConcurrent: 3 });
  });

  afterEach(() => {
    manager.stopGC();
  });

  it('should create a new session', () => {
    const session = manager.getOrCreate('webchat', 'user1', 'dm');
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe('user1');
    expect(session.channelType).toBe('webchat');
    expect(session.conversationType).toBe('dm');
    expect(manager.size).toBe(1);
  });

  it('should return existing session for same user', () => {
    const session1 = manager.getOrCreate('webchat', 'user1', 'dm');
    const session2 = manager.getOrCreate('webchat', 'user1', 'dm');
    expect(session1.id).toBe(session2.id);
    expect(manager.size).toBe(1);
  });

  it('should create separate sessions for different users', () => {
    const session1 = manager.getOrCreate('webchat', 'user1', 'dm');
    const session2 = manager.getOrCreate('webchat', 'user2', 'dm');
    expect(session1.id).not.toBe(session2.id);
    expect(manager.size).toBe(2);
  });

  it('should create separate sessions for group vs dm', () => {
    const dm = manager.getOrCreate('dingtalk', 'user1', 'dm');
    const group = manager.getOrCreate('dingtalk', 'user1', 'group', 'group1');
    expect(dm.id).not.toBe(group.id);
    expect(manager.size).toBe(2);
  });

  it('should evict oldest session when max concurrent reached', () => {
    manager.getOrCreate('webchat', 'user1', 'dm');
    manager.getOrCreate('webchat', 'user2', 'dm');
    manager.getOrCreate('webchat', 'user3', 'dm');

    // This should evict user1 (oldest)
    const session4 = manager.getOrCreate('webchat', 'user4', 'dm');
    expect(manager.size).toBe(3);
    expect(session4.userId).toBe('user4');
  });

  it('should cleanup expired sessions', () => {
    const session = manager.getOrCreate('webchat', 'user1', 'dm');
    // Manually set lastActiveAt to 2 minutes ago
    session.lastActiveAt = Date.now() - 2 * 60 * 1000;

    const removed = manager.cleanup();
    expect(removed).toBe(1);
    expect(manager.size).toBe(0);
  });

  it('should remove session by id', () => {
    const session = manager.getOrCreate('webchat', 'user1', 'dm');
    expect(manager.remove(session.id)).toBe(true);
    expect(manager.size).toBe(0);
  });

  it('should return false when removing non-existent session', () => {
    expect(manager.remove('nonexistent')).toBe(false);
  });

  it('should list all sessions', () => {
    manager.getOrCreate('webchat', 'user1', 'dm');
    manager.getOrCreate('webchat', 'user2', 'dm');

    const sessions = manager.listAll();
    expect(sessions).toHaveLength(2);
  });
});
