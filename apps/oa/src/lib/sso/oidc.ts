import "server-only";
import crypto from "node:crypto";
import { ssoConfig, redirectUri, type SsoConfig } from "./config";

/**
 * ไคลเอนต์ OIDC ขนาดเล็ก — Authorization Code + PKCE, ตรวจลายเซ็น id_token ด้วย JWKS
 * เขียนเองด้วย node:crypto เพื่อไม่ต้องเพิ่ม dependency ให้ระบบที่รันบนเครื่องภายใน
 */

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  code_challenge_methods_supported?: string[];
};

let discoveryCache: { at: number; data: Discovery } | null = null;
const HOUR = 3600_000;

export async function discover(cfg: SsoConfig = ssoConfig()): Promise<Discovery> {
  if (discoveryCache && Date.now() - discoveryCache.at < HOUR) return discoveryCache.data;

  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) throw new Error(`อ่านค่าตั้งต้น OIDC ไม่ได้ (HTTP ${res.status})`);
  const data = (await res.json()) as Discovery;
  if (data.issuer !== cfg.issuer) {
    throw new Error(`issuer ไม่ตรงกับที่ตั้งไว้: ${data.issuer}`);
  }
  discoveryCache = { at: Date.now(), data };
  return data;
}

/* ---------- PKCE ---------- */

const b64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export const randomToken = () => b64url(crypto.randomBytes(24));

/* ---------- ขั้นที่ 1: พาไปหน้าล็อกอินของระบบกลาง ---------- */

export async function authorizeUrl({
  state,
  nonce,
  challenge,
  cfg = ssoConfig(),
}: {
  state: string;
  nonce: string;
  challenge: string;
  cfg?: SsoConfig;
}): Promise<string> {
  const d = await discover(cfg);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg),
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${d.authorization_endpoint}?${params}`;
}

/* ---------- ขั้นที่ 2: แลก code เป็น token ---------- */

export type TokenSet = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export async function exchangeCode(
  code: string,
  verifier: string,
  cfg: SsoConfig = ssoConfig(),
): Promise<TokenSet> {
  const d = await discover(cfg);
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(cfg),
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });

  const json = (await res.json()) as TokenSet & { error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || `แลก token ไม่สำเร็จ (HTTP ${res.status})`);
  }
  return json;
}

/* ---------- ตรวจลายเซ็น id_token ---------- */

type Jwk = { kid: string; kty: string; alg?: string; n?: string; e?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function jwks(cfg: SsoConfig): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < HOUR) return jwksCache.keys;
  const d = await discover(cfg);
  const res = await fetch(d.jwks_uri, { cache: "no-store" });
  if (!res.ok) throw new Error(`อ่าน JWKS ไม่ได้ (HTTP ${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

export type IdClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  name?: string;
  picture?: string;
  roles?: string[] | string;
  groups?: string[] | string;
  [k: string]: unknown;
};

/**
 * ตรวจ id_token ให้ครบทุกด้านก่อนเชื่อ:
 * ลายเซ็น (RS256 ตาม JWKS) · ผู้ออก · ผู้รับ · วันหมดอายุ · nonce
 */
export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
  cfg: SsoConfig = ssoConfig(),
): Promise<IdClaims> {
  const [headerB64, payloadB64, sigB64] = idToken.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("รูปแบบ id_token ไม่ถูกต้อง");

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as {
    alg: string;
    kid?: string;
  };
  if (header.alg !== "RS256") throw new Error(`ไม่รองรับอัลกอริทึม ${header.alg}`);

  const keys = await jwks(cfg);
  const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
  if (!jwk) throw new Error("ไม่พบกุญแจสาธารณะที่ตรงกับ id_token");

  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(sigB64, "base64url"),
  );
  if (!ok) throw new Error("ลายเซ็น id_token ไม่ถูกต้อง");

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as IdClaims;

  if (claims.iss !== cfg.issuer) throw new Error("ผู้ออก token ไม่ตรงกับระบบกลางที่ตั้งไว้");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) throw new Error("token ไม่ได้ออกให้แอปนี้");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    throw new Error("id_token หมดอายุแล้ว");
  }
  if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
    throw new Error("nonce ไม่ตรง — อาจถูกยิงซ้ำ");
  }

  return claims;
}

/** ดึงโปรไฟล์เพิ่มจาก userinfo — เผื่อ roles/groups ไม่ได้อยู่ใน id_token */
export async function fetchUserinfo(
  accessToken: string,
  cfg: SsoConfig = ssoConfig(),
): Promise<Record<string, unknown>> {
  const d = await discover(cfg);
  const res = await fetch(d.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return {};
  return (await res.json()) as Record<string, unknown>;
}

export async function endSessionUrl(cfg: SsoConfig = ssoConfig()): Promise<string | null> {
  const d = await discover(cfg).catch(() => null);
  return d?.end_session_endpoint ?? null;
}
