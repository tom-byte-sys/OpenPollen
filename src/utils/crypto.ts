import { randomUUID, createHash } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function generateSessionId(): string {
  return `ses_${randomUUID().replace(/-/g, '')}`;
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function maskSecret(secret: string, visibleChars = 4): string {
  if (secret.length <= visibleChars) return '***';
  return secret.slice(0, visibleChars) + '***' + secret.slice(-visibleChars);
}
