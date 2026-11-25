import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.TKEY_BASE_URL?.trim();
  if (!baseUrl) {
    return NextResponse.json({ ok: true, workerConfigured: false, state: null, wireless: [], wired: [] });
  }
  try {
    const res = await fetch(`${baseUrl}/state`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json({ ...data, workerConfigured: true }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, workerConfigured: true, message: err instanceof Error ? err.message : '워커 연결 오류' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
