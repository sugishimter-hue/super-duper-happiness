import { redirect } from "next/navigation";
import { adminAllowed } from "@/lib/server";
import LoginForm from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 로그인 | 유니패스 라이프", robots: { index: false, follow: false } };

export default async function Page() {
  if (await adminAllowed()) redirect("/admin");
  return <LoginForm />;
}
