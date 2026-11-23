// 관리자 인증: Cloudflare Secret 으로 저장한 ADMIN_PASSWORD 로 로그인하고,
// SESSION_SECRET 으로 서명한 HttpOnly 쿠키로 12시간 동안 로그인 상태를 유지합니다.
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "unipath_admin";
const SESSION_HOURS = 12;
const encoder = new TextEncoder();

function secret(): string | null {
  const s = (env as unknown as Record<string, unknown>).SESSION_SECRET;
  return typeof s === "string" && s.length >= 32 ? s : null;
}

export function adminPasswordConfigured(): boolean {
  const p = (env as unknown as Record<string, unknown>).ADMIN_PASSWORD;
  return typeof p === "string" && p.length >= 8 && secret() !== null;
}

async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function checkPassword(input: string): Promise<boolean> {
  const p = (env as unknown as Record<string, unknown>).ADMIN_PASSWORD;
  const s = secret();
  if (typeof p !== "string" || !s) return false;
  // 길이 정보가 새지 않도록 HMAC 값끼리 비교합니다.
  return safeEqual(await hmac(input, s), await hmac(p, s));
}

export async function createSessionValue(): Promise<string> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET 이 설정되지 않았습니다.");
  const payload = `admin.${Date.now() + SESSION_HOURS * 3600_000}`;
  return `${payload}.${await hmac(payload, s)}`;
}

export const sessionMaxAge = SESSION_HOURS * 3600;

export async function isAdmin(): Promise<boolean> {
  const s = secret();
  if (!s) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i), sig = value.slice(i + 1);
  const [who, exp] = payload.split(".");
  if (who !== "admin" || !(Number(exp) > Date.now())) return false;
  return safeEqual(sig, await hmac(payload, s));
}
