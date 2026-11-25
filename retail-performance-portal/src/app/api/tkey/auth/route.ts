import { NextRequest, NextResponse } from 'next/server';

/**
 * T.Key-taka (티키타카) 인증 API
 * - action: 'request_sms' | 'verify_sms' | 'status'
 * - 실제 T.Key-taka 연동 서버(process.env.TKEY_BASE_URL)가 설정된 경우 해당 엔드포인트로 프록시합니다.
 * - 미설정 상태에서는 UI 검증 및 연동 준비 상태를 안내합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, password, smsCode } = body ?? {};
    const baseUrl = process.env.TKEY_BASE_URL?.trim();

    if (action === 'request_sms') {
      if (!userId || !password) {
        return NextResponse.json(
          { ok: false, message: 'T.Key-taka 아이디와 비밀번호를 입력해주세요.' },
          { status: 400 }
        );
      }

      if (baseUrl) {
        const res = await fetch(`${baseUrl}/auth/request-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, password }),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }

      return NextResponse.json({
        ok: true,
        mode: 'scaffold',
        message:
          '연동 어댑터 준비 상태입니다. 실제 SMS 발송을 위해 Vercel 환경변수(TKEY_BASE_URL)에 T.Key-taka 연동 게이트웨이를 연결하세요. (테스트 인증코드: 000000)',
      });
    }

    if (action === 'verify_sms') {
      if (!smsCode || String(smsCode).trim().length !== 6) {
        return NextResponse.json(
          { ok: false, message: '6자리 SMS 인증번호를 정확히 입력해주세요.' },
          { status: 400 }
        );
      }

      if (baseUrl) {
        const res = await fetch(`${baseUrl}/auth/verify-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, smsCode }),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }

      return NextResponse.json({
        ok: true,
        mode: 'scaffold',
        connected: true,
        connectedAt: new Date().toISOString(),
        message: '티키타카 인증 세션이 연결되었습니다. (어댑터 대기 모드)',
      });
    }

    if (action === 'disconnect') {
      if (baseUrl) {
        const res = await fetch(`${baseUrl}/auth/disconnect`, { method: 'POST' });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }
      return NextResponse.json({ ok: true, connected: false, message: '연동을 해제했습니다.' });
    }

    if (action === 'status') {
      if (baseUrl) {
        const res = await fetch(`${baseUrl}/auth/status`);
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      }
      return NextResponse.json({ ok: true, connected: false, keepAliveIntervalMin: 10 });
    }

    return NextResponse.json({ ok: false, message: '지원하지 않는 요청입니다.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : '인증 처리 중 오류' },
      { status: 500 }
    );
  }
}
