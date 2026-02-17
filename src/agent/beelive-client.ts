import { getLogger } from '../utils/logger.js';

const log = getLogger('beelive-client');

const DEFAULT_BASE_URL = process.env.BEELIVE_API_URL || 'https://lite.beebywork.com/api/v1';

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  email: string;
  is_active: boolean;
  status?: string;
}

export interface DesktopApiKeyResponse {
  /** 首次创建时返回完整 key */
  api_key?: string;
  /** key 已存在时为 true */
  exists?: boolean;
  /** key 已存在时返回前缀 */
  key_prefix?: string;
  name?: string;
  created_at?: string;
  message?: string;
}

export interface TrialStatus {
  is_trial: boolean;
  trial_active: boolean;
  trial_expires_at?: string;
  remaining_days?: number;
  total_requests?: number;
  remaining_requests?: number;
}

export interface Subscription {
  plan: string;
  status: string;
  expires_at?: string;
  rate_limit?: {
    requests_per_minute: number;
    requests_per_day: number;
  };
}

export class BeeliveClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.token) {
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  /**
   * POST /auth/register (JSON)
   */
  async register(email: string, password: string): Promise<AuthResponse> {
    const url = `${this.baseUrl}/auth/register`;
    log.debug({ url }, 'register');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `注册失败 (${response.status})`);
    }

    return response.json() as Promise<AuthResponse>;
  }

  /**
   * POST /auth/login (form-urlencoded, fields: username + password)
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const url = `${this.baseUrl}/auth/login`;
    log.debug({ url }, 'login');

    const body = new URLSearchParams();
    body.set('username', email);
    body.set('password', password);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `登录失败 (${response.status})`);
    }

    return response.json() as Promise<AuthResponse>;
  }

  /**
   * GET /api-keys/desktop
   */
  async getDesktopApiKey(): Promise<DesktopApiKeyResponse> {
    const url = `${this.baseUrl}/api-keys/desktop`;
    log.debug({ url }, 'getDesktopApiKey');

    const response = await fetch(url, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `获取 API Key 失败 (${response.status})`);
    }

    return response.json() as Promise<DesktopApiKeyResponse>;
  }

  /**
   * GET /trial/full
   */
  async getTrialStatus(): Promise<TrialStatus> {
    const url = `${this.baseUrl}/trial/full`;
    log.debug({ url }, 'getTrialStatus');

    const response = await fetch(url, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `获取试用状态失败 (${response.status})`);
    }

    return response.json() as Promise<TrialStatus>;
  }

  /**
   * GET /subscription
   */
  async getSubscription(): Promise<Subscription> {
    const url = `${this.baseUrl}/subscription`;
    log.debug({ url }, 'getSubscription');

    const response = await fetch(url, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `获取订阅信息失败 (${response.status})`);
    }

    return response.json() as Promise<Subscription>;
  }

  /**
   * GET /auth/me
   */
  async getMe(): Promise<UserInfo> {
    const url = `${this.baseUrl}/auth/me`;
    log.debug({ url }, 'getMe');

    const response = await fetch(url, {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { detail?: string };
      throw new Error(data.detail || `获取用户信息失败 (${response.status})`);
    }

    return response.json() as Promise<UserInfo>;
  }
}

/** @deprecated Use BeeliveClient instead */
export { BeeliveClient as AgentTermClient };
