import { NextRequest, NextResponse } from 'next/server';

/**
 * Vercel Cron 자동연동 엔드포인트 (vercel.json: KST 09:00~21:00 매 30분)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.TKEY_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'TKEY_BASE_URL 미설정',
      executedAt: new Date().toISOString(),
    });
  }

  try {
    const res = await fetch(`${baseUrl}/sync/cron`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json({ ok: true, executedAt: new Date().toISOString(), data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : '크론 실행 오류' },
      { status: 500 }
    );
  }
}
