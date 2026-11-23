import { env } from "cloudflare:workers";
import { checkPassword, createSessionValue, adminPasswordConfigured, SESSION_COOKIE, sessionMaxAge } from "@/lib/auth";
import { sameOrigin, ensureSchema } from "@/lib/server";

// 비밀번호를 5번 틀리면 15분 동안 잠급니다 (D1에 IP별로 기록).
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;

async function attempts(db: D1Database) {
  await ensureSchema();
  return db;
}

export async function POST(r: Request) {
  if (!sameOrigin(r)) return Response.json({ error: "허용되지 않는 요청입니다." }, { status: 403 });
  if (!adminPasswordConfigured()) return Response.json({ error: "관리자 비밀번호가 아직 설정되지 않았습니다. README의 배포 안내를 확인해 주세요." }, { status: 503 });
  const db = await attempts((env as unknown as { DB: D1Database }).DB);
  const ip = r.headers.get("cf-connecting-ip") ?? "local";
  const row = await db.prepare("SELECT fails, locked_until FROM login_attempts WHERE ip=?").bind(ip).first<{ fails: number; locked_until: number }>();
  if (row && row.locked_until > Date.now()) {
    const min = Math.ceil((row.locked_until - Date.now()) / 60_000);
    return Response.json({ error: `비밀번호를 여러 번 틀려 잠겼습니다. ${min}분 후 다시 시도해 주세요.` }, { status: 429 });
  }
  const body = (await r.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!(await checkPassword(password))) {
    const fails = (row && row.locked_until <= Date.now() && row.fails >= MAX_FAILS ? 0 : row?.fails ?? 0) + 1;
    const locked = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
    await db.prepare("INSERT INTO login_attempts (ip, fails, locked_until) VALUES (?,?,?) ON CONFLICT(ip) DO UPDATE SET fails=excluded.fails, locked_until=excluded.locked_until").bind(ip, fails, locked).run();
    return Response.json({ error: locked ? "비밀번호를 5번 틀려 15분 동안 잠겼습니다." : `비밀번호가 맞지 않습니다. (${fails}/${MAX_FAILS})` }, { status: 401 });
  }
  await db.prepare("DELETE FROM login_attempts WHERE ip=?").bind(ip).run();
  const secure = new URL(r.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ ok: true }, {
    headers: { "Set-Cookie": `${SESSION_COOKIE}=${await createSessionValue()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionMaxAge}${secure}` },
  });
}
