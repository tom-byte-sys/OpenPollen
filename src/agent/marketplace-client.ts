import { getLogger } from '../utils/logger.js';

const log = getLogger('marketplace-client');

export interface SearchOptions {
  category?: string;
  pricingModel?: string;
  sortBy?: 'downloads' | 'rating' | 'newest';
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: SkillListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface SkillListItem {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  pricing_model: string;
  price: number;
  download_count: number;
  avg_rating: number;
  rating_count: number;
  author_id: string;
  author_name?: string;
  is_official: boolean;
  created_at: string;
}

export interface SkillDetail extends SkillListItem {
  icon_url?: string;
  repository_url?: string;
  status: string;
  latest_version?: VersionInfo;
}

export interface VersionInfo {
  id: string;
  version: string;
  changelog: string;
  skill_md_content: string;
  package_url?: string;
  package_hash?: string;
  package_size: number;
  is_latest: boolean;
  created_at: string;
}

export interface PurchaseResult {
  status: 'installed' | 'pending_payment';
  payment_id?: string;
  order_no?: string;
  amount?: number;
  qr_code_url?: string;
  message?: string;
  install?: Record<string, unknown>;
}

export interface EarningsSummary {
  month: string;
  total_amount: number;
  platform_fee: number;
  author_earning: number;
  install_count: number;
}

export interface PublishData {
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  pricing_model?: string;
  price?: number;
}

export class MarketplaceClient {
  private apiUrl: string;
  private authToken?: string;

  constructor(apiUrl: string, authToken?: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.authToken = authToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    log.debug({ method, url }, '发起请求');
    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (opts?.category) params.set('category', opts.category);
    if (opts?.pricingModel) params.set('pricing_model', opts.pricingModel);
    if (opts?.sortBy) params.set('sort_by', opts.sortBy);
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.pageSize) params.set('page_size', String(opts.pageSize));

    const qs = params.toString();
    return this.request<SearchResult>('GET', `/skills${qs ? `?${qs}` : ''}`);
  }

  async getSkill(skillId: string): Promise<SkillDetail> {
    return this.request<SkillDetail>('GET', `/skills/${skillId}`);
  }

  async downloadPackage(skillId: string): Promise<Buffer> {
    const url = `${this.apiUrl}/skills/${skillId}/download`;
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) {
      throw new Error(`下载失败 (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async checkPurchase(skillId: string): Promise<boolean> {
    const result = await this.request<{ purchased: boolean }>('GET', `/skills/${skillId}/purchase/status`);
    return result.purchased;
  }

  async createPurchase(skillId: string): Promise<PurchaseResult> {
    return this.request<PurchaseResult>('POST', `/skills/${skillId}/purchase`);
  }

  async getEarnings(month?: string): Promise<EarningsSummary[]> {
    if (month) {
      return this.request<EarningsSummary[]>('GET', `/my/earnings/${month}`);
    }
    return this.request<EarningsSummary[]>('GET', '/my/earnings');
  }

  async publish(data: PublishData): Promise<SkillDetail> {
    return this.request<SkillDetail>('POST', '/skills', data);
  }

  async uploadVersion(
    skillId: string,
    pkg: Buffer,
    version: string,
    changelog: string,
    skillMdContent: string,
  ): Promise<void> {
    const url = `${this.apiUrl}/skills/${skillId}/versions`;
    const formData = new FormData();
    formData.set('version', version);
    formData.set('changelog', changelog);
    formData.set('skill_md_content', skillMdContent);
    formData.set('package', new Blob([pkg], { type: 'application/gzip' }), 'package.tar.gz');

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`上传版本失败 (${response.status}): ${text}`);
    }
  }

  async getMySkills(): Promise<SkillListItem[]> {
    return this.request<SkillListItem[]>('GET', '/my/skills');
  }

  async getMyPurchases(): Promise<Record<string, unknown>[]> {
    return this.request<Record<string, unknown>[]>('GET', '/my/purchases');
  }
}
