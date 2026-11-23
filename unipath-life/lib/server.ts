import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/auth";

export function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw Error("DB unavailable");
  return db;
}

// 처음 배포된 빈 데이터베이스에서도 바로 동작하도록 표를 자동으로 만듭니다.
// (drizzle/ 폴더의 마이그레이션과 같은 구조이며, 이미 있으면 아무것도 하지 않습니다.)
let schemaReady: Promise<unknown> | null = null;
export function ensureSchema() {
  schemaReady ??= database().batch([
    database().prepare("CREATE TABLE IF NOT EXISTS `requests` (`id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `name` text NOT NULL, `phone` text NOT NULL, `email` text DEFAULT '' NOT NULL, `topic` text NOT NULL, `time` text NOT NULL, `detail` text DEFAULT '' NOT NULL, `status` text DEFAULT '신규' NOT NULL, `assignee` text DEFAULT '' NOT NULL, `notes` text DEFAULT '' NOT NULL, `revenue` integer DEFAULT 0 NOT NULL, `consent_version` text NOT NULL, `created_at` integer NOT NULL, `expires_at` integer NOT NULL)"),
    database().prepare("CREATE INDEX IF NOT EXISTS `idx_requests_created` ON `requests` (`created_at`)"),
    database().prepare("CREATE INDEX IF NOT EXISTS `idx_requests_expires` ON `requests` (`expires_at`)"),
    database().prepare("CREATE TABLE IF NOT EXISTS `operating_policy` (`id` integer PRIMARY KEY, `policy` text NOT NULL, `revision` integer NOT NULL)"),
    database().prepare("CREATE TABLE IF NOT EXISTS `login_attempts` (`ip` text PRIMARY KEY, `fails` integer NOT NULL, `locked_until` integer NOT NULL)"),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

export async function adminAllowed() {
  return isAdmin();
}
export function sameOrigin(r: Request) {
  return r.headers.get("origin") === new URL(r.url).origin;
}
export async function purge() {
  await ensureSchema();
  return database().prepare("DELETE FROM requests WHERE expires_at < ?").bind(Date.now()).run();
}
