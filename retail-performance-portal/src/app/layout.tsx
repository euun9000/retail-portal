import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '소매 · 도매 통합 실적관리',
  description: '판매현황 · 실적보고 · 사용자관리(티키타카 연동) 통합 웹 포털',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
