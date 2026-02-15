import { getLogger } from '../utils/logger.js';
import type { AppConfig } from '../config/schema.js';

const log = getLogger('auth');

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  error?: string;
}

export class AuthService {
  private mode: string;
  private backendUrl?: string;

  constructor(config: AppConfig['gateway']['auth']) {
    this.mode = config.mode;
    this.backendUrl = config.backendUrl;
  }

  async verify(credentials: { apiKey?: string; jwt?: string }): Promise<AuthResult> {
    switch (this.mode) {
      case 'none':
        return { authenticated: true, userId: 'anonymous' };

      case 'api-key':
        return this.verifyApiKey(credentials.apiKey);

      case 'jwt':
        return this.verifyJwt(credentials.jwt);

      default:
        return { authenticated: false, error: `未知认证模式: ${this.mode}` };
    }
  }

  private async verifyApiKey(apiKey?: string): Promise<AuthResult> {
    if (!apiKey) {
      return { authenticated: false, error: '缺少 API Key' };
    }

    if (!this.backendUrl) {
      return { authenticated: false, error: '未配置后端 URL' };
    }

    try {
      const response = await fetch(`${this.backendUrl}/api-keys/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!response.ok) {
        return { authenticated: false, error: 'API Key 验证失败' };
      }

      const data = await response.json() as { user_id?: string };
      return { authenticated: true, userId: data.user_id ?? 'unknown' };
    } catch (error) {
      log.error({ error }, 'API Key 验证请求失败');
      return { authenticated: false, error: '认证服务不可用' };
    }
  }

  private async verifyJwt(jwt?: string): Promise<AuthResult> {
    if (!jwt) {
      return { authenticated: false, error: '缺少 JWT' };
    }

    if (!this.backendUrl) {
      return { authenticated: false, error: '未配置后端 URL' };
    }

    try {
      const response = await fetch(`${this.backendUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
      });

      if (!response.ok) {
        return { authenticated: false, error: 'JWT 验证失败' };
      }

      const data = await response.json() as { user_id?: string };
      return { authenticated: true, userId: data.user_id ?? 'unknown' };
    } catch (error) {
      log.error({ error }, 'JWT 验证请求失败');
      return { authenticated: false, error: '认证服务不可用' };
    }
  }
}
