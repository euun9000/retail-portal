import { NextRequest, NextResponse } from 'next/server';

/**
 * T.Key-taka (티키타카) 수동 즉시 동기화 API
 * - TKEY_BASE_URL이 설정되면 T판매관리(무선)/유선판매 데이터를 가져옵니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl = process.env.TKEY_BASE_URL?.trim();

    if (baseUrl) {
      const res = await fetch(`${baseUrl}/sync/latest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json({
      ok: true,
      mode: 'scaffold',
      syncedAt: new Date().toISOString(),
      message:
        'TKEY_BASE_URL이 아직 설정되지 않아 수동 업로드 데이터를 유지합니다. 환경변수 설정 시 자동 수집이 활성화됩니다.',
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : '동기화 오류' },
      { status: 500 }
    );
  }
}
