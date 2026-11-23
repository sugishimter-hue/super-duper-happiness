import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/auth";

export function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw Error("DB unavailable");
  return db;
}
export async function adminAllowed() {
  return isAdmin();
}
export function sameOrigin(r: Request) {
  return r.headers.get("origin") === new URL(r.url).origin;
}
export async function purge() {
  return database().prepare("DELETE FROM requests WHERE expires_at < ?").bind(Date.now()).run();
}
