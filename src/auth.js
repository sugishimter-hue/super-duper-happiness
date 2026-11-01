// 대표 1인 로그인: 비밀번호(scrypt 해시) + 세션 쿠키
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, save } from './store.js';

const SESSION_DAYS = 30;
const COOKIE = 'aio_session';
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateNewPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (pw.length > 200) return '비밀번호가 너무 깁니다.';
  return null;
}

export const needsSetup = () => !db.auth?.passwordHash;

export function setPassword(pw) {
  db.auth = { ...(db.auth || {}), passwordHash: hashPassword(pw) };
  db.sessions = []; // 비밀번호가 바뀌면 다른 기기의 로그인은 모두 해제
  save();
}

export function checkPassword(pw) {
  return typeof pw === 'string' && !needsSetup() && verifyPassword(pw, db.auth.passwordHash);
}

// ───────── 로그인 시도 제한 (IP별 15분에 5회) ─────────
const fails = new Map();
export function loginBlocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_MS) {
    fails.delete(ip);
    return false;
  }
  return f.count >= MAX_FAILS;
}
export function recordFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > LOCK_MS) fails.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}
export const clearFails = (ip) => fails.delete(ip);

// ───────── 세션 ─────────
function pruneSessions() {
  db.sessions = (db.sessions || []).filter((s) => s.exp > Date.now());
}

export function createSession() {
  pruneSessions();
  const token = randomBytes(32).toString('base64url');
  db.sessions.push({ hash: sha256(token), exp: Date.now() + SESSION_DAYS * 864e5 });
  save();
  return token;
}

export function destroySession(token) {
  if (!token) return;
  db.sessions = (db.sessions || []).filter((s) => s.hash !== sha256(token));
  save();
}

export function readToken(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function isLoggedIn(req) {
  const token = readToken(req);
  if (!token) return false;
  const h = sha256(token);
  return (db.sessions || []).some((s) => s.hash === h && s.exp > Date.now());
}

export function sessionCookie(token, secure) {
  const base = `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86400}` : `${base}; Max-Age=0`;
}
