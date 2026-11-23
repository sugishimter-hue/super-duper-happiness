import { redirect } from "next/navigation";
import { adminAllowed } from "@/lib/server";
import Admin from "./panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "상담 운영 관리 | 유니패스 라이프", robots: { index: false, follow: false } };

export default async function Page() {
  if (!(await adminAllowed())) redirect("/admin/login");
  return <Admin />;
}
