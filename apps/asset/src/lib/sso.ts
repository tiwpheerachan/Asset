import 'server-only';
import crypto from 'node:crypto';
import { USERS } from '@/data/masters';
import type { Role } from './types';

/**
 * เชื่อม ONE Asset เข้า SSO กลาง (sso.shd-technology.co.th) — OIDC มาตรฐาน + PKCE
 * เขียนเองด้วย node:crypto (ไม่เพิ่ม dependency) · session เก็บเป็น signed cookie
 * ล็อกอินจริงผ่านระบบกลางเท่านั้น — เลิกใช้ dropdown จำลองเมื่อ SSO พร้อม
 */

const ROLES: Role[] = ['ACCOUNTANT', 'MANAGER', 'ADMIN', 'AUDITOR'];
const isRole = (v: string): v is Role => (ROLES as string[]).includes(v);

export type SsoConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  scopes: string;
  defaultRole: Role;
  roleMap: Record<string, Role>;
  allowLocalLogin: boolean;
};

function parseRoleMap(raw: string | undefined): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const pair of (raw ?? '').split(',')) {
    const [email, role] = pair.split(':').map((x) => x.trim());
    if (email && role && isRole(role)) out[email.toLowerCase()] = role;
  }
  return out;
}

export function ssoConfig(): SsoConfig {
  const dr = process.env.SSO_DEFAULT_ROLE;
  return {
    issuer: (process.env.SSO_ISSUER?.trim() || '').replace(/\/$/, ''),
    clientId: process.env.SSO_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.SSO_CLIENT_SECRET?.trim() ?? '',
    baseUrl: (process.env.APP_BASE_URL?.trim() || 'http://localhost:3020').replace(/\/$/, ''),
    scopes: process.env.SSO_SCOPES?.trim() || 'openid profile email',
    defaultRole: dr && isRole(dr) ? dr : 'ACCOUNTANT',
    roleMap: parseRoleMap(process.env.SSO_ROLE_MAP),
    allowLocalLogin: process.env.SSO_ALLOW_LOCAL_LOGIN === 'true',
  };
}

export function ssoReady(cfg = ssoConfig()): boolean {
  return Boolean(cfg.issuer && cfg.clientId && cfg.clientSecret);
}

export const redirectUri = (cfg = ssoConfig()) => `${cfg.baseUrl}/api/auth/sso/callback`;

/* ───────────── OIDC discovery + flow ───────────── */

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

let discoveryCache: { at: number; data: Discovery } | null = null;
const HOUR = 3600_000;

export async function discover(cfg: SsoConfig = ssoConfig()): Promise<Discovery> {
  if (discoveryCache && Date.now() - discoveryCache.at < HOUR) return discoveryCache.data;
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`อ่านค่าตั้งต้น OIDC ไม่ได้ (HTTP ${res.status})`);
  const data = (await res.json()) as Discovery;
  if (data.issuer !== cfg.issuer) throw new Error(`issuer ไม่ตรง: ${data.issuer}`);
  discoveryCache = { at: Date.now(), data };
  return data;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export function createPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}
export const randomToken = () => b64url(crypto.randomBytes(24));

export async function authorizeUrl(
  { state, nonce, challenge }: { state: string; nonce: string; challenge: string },
  cfg: SsoConfig = ssoConfig(),
): Promise<string> {
  const d = await discover(cfg);
  const params = new URLSearchParams({
    response_type: 'code', client_id: cfg.clientId, redirect_uri: redirectUri(cfg),
    scope: cfg.scopes, state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `${d.authorization_endpoint}?${params}`;
}

type TokenSet = { access_token: string; id_token: string; error?: string; error_description?: string };

export async function exchangeCode(code: string, verifier: string, cfg: SsoConfig = ssoConfig()): Promise<TokenSet> {
  const d = await discover(cfg);
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(cfg),
      client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  const json = (await res.json()) as TokenSet;
  if (!res.ok || json.error) throw new Error(json.error_description || json.error || `แลก token ไม่สำเร็จ (HTTP ${res.status})`);
  return json;
}

type Jwk = { kid: string; kty: string; n?: string; e?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;
async function jwks(cfg: SsoConfig): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < HOUR) return jwksCache.keys;
  const d = await discover(cfg);
  const res = await fetch(d.jwks_uri, { cache: 'no-store' });
  if (!res.ok) throw new Error(`อ่าน JWKS ไม่ได้ (HTTP ${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

export type IdClaims = { sub: string; iss: string; aud: string | string[]; exp: number; nonce?: string; email?: string; name?: string; picture?: string };

export async function verifyIdToken(idToken: string, expectedNonce: string, cfg: SsoConfig = ssoConfig()): Promise<IdClaims> {
  const [h, p, s] = idToken.split('.');
  if (!h || !p || !s) throw new Error('รูปแบบ id_token ไม่ถูกต้อง');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg: string; kid?: string };
  if (header.alg !== 'RS256') throw new Error(`ไม่รองรับอัลกอริทึม ${header.alg}`);
  const keys = await jwks(cfg);
  const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
  if (!jwk) throw new Error('ไม่พบกุญแจสาธารณะ');
  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('ลายเซ็น id_token ไม่ถูกต้อง');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as IdClaims;
  if (claims.iss !== cfg.issuer) throw new Error('ผู้ออก token ไม่ตรง');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) throw new Error('token ไม่ได้ออกให้แอปนี้');
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new Error('id_token หมดอายุ');
  if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) throw new Error('nonce ไม่ตรง');
  return claims;
}

export async function endSessionUrl(cfg: SsoConfig = ssoConfig()): Promise<string | null> {
  const d = await discover(cfg).catch(() => null);
  return d?.end_session_endpoint ?? null;
}

/* ───────────── session cookie (signed) ───────────── */

export const SESSION_COOKIE = 'fa_sso';
export type Session = { userId: string; role: Role; name: string; email: string; avatarUrl?: string | null; title?: string | null; department?: string | null };

function secret(cfg = ssoConfig()) {
  return process.env.SESSION_SECRET?.trim() || cfg.clientSecret || 'fa-dev-secret';
}

export function signSession(s: Session, cfg = ssoConfig()): string {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret(cfg)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined, cfg = ssoConfig()): Session | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', secret(cfg)).update(body).digest('base64url');
  // เทียบแบบ constant-time กันเดาลายเซ็น
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (!s.userId || !isRole(s.role)) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * แปลง claims จากระบบกลาง → session ของ Asset
 * ลำดับ: (1) จับคู่อีเมลกับผู้ใช้ใน fa.users ที่แอดมินตั้งไว้ (ตัวตัดสินหลัก)
 *        (2) SSO_ROLE_MAP จาก env  (3) บทบาทเริ่มต้น
 */
export async function mapClaims(claims: IdClaims, cfg = ssoConfig()): Promise<Session> {
  const email = (claims.email || '').trim().toLowerCase();
  const name = (claims.name || '').trim() || email || claims.sub;
  const { getUsers } = await import('./fa-repo');
  const users = await getUsers().catch(() => USERS);
  const existing = email ? users.find((u) => u.email.toLowerCase() === email && u.active !== false) : undefined;

  // โปรไฟล์: ใช้ค่าที่เก็บไว้ก่อน → picture จาก token → ค้นไดเรกทอรีกลางด้วยอีเมล
  let avatarUrl = existing?.avatarUrl ?? claims.picture ?? null;
  let title = existing?.title ?? null;
  let department = existing?.department ?? null;
  if (email && (!avatarUrl || !title || !department)) {
    try {
      const { searchDirectory } = await import('./directory');
      const r = await searchDirectory(email);
      if (r.ok) {
        const hit = r.items.find((p) => (p.email || '').toLowerCase() === email) ?? r.items[0];
        if (hit) {
          avatarUrl = avatarUrl ?? hit.avatar_url ?? null;
          title = title ?? hit.job_title ?? null;
          department = department ?? hit.departments?.[0] ?? null;
        }
      }
    } catch {
      /* ไดเรกทอรีไม่พร้อม — ข้ามไป */
    }
  }

  if (existing) return { userId: existing.id, role: existing.role, name: existing.name, email, avatarUrl, title, department };
  const role = (email && cfg.roleMap[email]) || cfg.defaultRole;
  return { userId: `SSO-${claims.sub}`, role, name, email, avatarUrl, title, department };
}
