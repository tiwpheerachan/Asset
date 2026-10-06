/**
 * OA API client — ห่อ `/api/v1/*` ของระบบ Internal Approval
 * ใช้ฝั่ง Asset เพื่อดึงคำขอที่อนุมัติแล้ว + รายงานกลับ
 */
import type {
  OAListResponse,
  OAPingResponse,
  OARequest,
  OATemplate,
  OAAccountingCallback,
} from './oa-types';

export interface OAClientConfig {
  baseUrl: string; // เช่น http://localhost:3010 หรือ https://oa.shd-technology.co.th
  apiKey: string; // ia_...
  fetchImpl?: typeof fetch; // เผื่อ inject ใน test
}

export class OAClient {
  private baseUrl: string;
  private apiKey: string;
  private f: typeof fetch;

  constructor(cfg: OAClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.apiKey = cfg.apiKey;
    this.f = cfg.fetchImpl ?? fetch;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.f(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'X-API-Key': this.apiKey,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OAApiError(res.status, path, text);
    }
    return (await res.json()) as T;
  }

  ping(): Promise<OAPingResponse> {
    return this.req<OAPingResponse>('/api/v1/ping');
  }

  templates(): Promise<{ count: number; data: OATemplate[] }> {
    return this.req('/api/v1/templates');
  }

  /** ดึงคำขอที่อนุมัติแล้ว (ค่า default status=APPROVED) */
  listRequests(opts: {
    status?: string;
    since?: string; // YYYY-MM-DD, กรองด้วย closed_at
    limit?: number;
    offset?: number;
  } = {}): Promise<OAListResponse> {
    const q = new URLSearchParams();
    q.set('status', opts.status ?? 'APPROVED');
    if (opts.since) q.set('since', opts.since);
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset != null) q.set('offset', String(opts.offset));
    return this.req<OAListResponse>(`/api/v1/requests?${q.toString()}`);
  }

  getRequest(idOrDocNo: string | number): Promise<{ data: OARequest }> {
    return this.req(`/api/v1/requests/${encodeURIComponent(String(idOrDocNo))}`);
  }

  /** รายงานกลับว่าปลายทางทำอะไรกับคำขอ (เช่น ขึ้นทะเบียนทรัพย์สินแล้ว) */
  reportAccounting(
    docNo: string,
    body: OAAccountingCallback,
  ): Promise<{ created: boolean; data: unknown }> {
    return this.req(`/api/v1/requests/${encodeURIComponent(docNo)}/accounting`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** URL เต็มของไฟล์แนบ (ต้องแนบ header X-API-Key เวลาดาวน์โหลด) */
  fileUrl(attachmentUrlOrId: string | number): string {
    const path =
      typeof attachmentUrlOrId === 'number'
        ? `/api/v1/files/${attachmentUrlOrId}`
        : attachmentUrlOrId;
    return `${this.baseUrl}${path}`;
  }
}

export class OAApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`OA API ${status} @ ${path}: ${body.slice(0, 200)}`);
    this.name = 'OAApiError';
  }
}
