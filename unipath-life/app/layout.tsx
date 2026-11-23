import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "유니패스 라이프 | 노후·간병·연금 상담";
const description = "내 삶의 다음 장을 위한 노후설계, 간병 준비, 연금 점검. 전경숙 대표(재무솔루션연구소 · AI글로벌유니패스아카데미)가 함께합니다. 상담 접수 무료.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["노후설계", "은퇴설계", "간병 준비", "연금 점검", "재무설계", "시니어 AI 교육", "전경숙", "유니패스 라이프", "천안 재무상담"],
  authors: [{ name: "전경숙" }],
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: { type: "website", locale: "ko_KR", siteName: "유니패스 라이프", title, description },
  twitter: { card: "summary", title, description },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#145747" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
