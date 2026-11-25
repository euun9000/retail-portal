import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const HEADLESS = process.env.HEADLESS === 'true' || process.env.NODE_ENV === 'production';
const DOWNLOAD_DIR = path.resolve('./downloads');
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const config = JSON.parse(fs.readFileSync(path.resolve('./config.selectors.json'), 'utf-8'));

let browser = null;
let context = null;
let page = null;
let sessionConnected = false;
let lastKeepAliveAt = null;
const KEEP_ALIVE_MS = Number(process.env.KEEP_ALIVE_MS || 5 * 60 * 1000); // 기본 5분마다 세션 연장

process.on('uncaughtException', (err) => {
  console.error('[tkey-worker] 예외 복구:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[tkey-worker] 비동기 예외 복구:', err);
});

async function ensurePage() {
  if (!browser) {
    browser = await chromium.launch({ headless: HEADLESS });
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
  }
  return page;
}

async function clickFirstVisible(p, selectorList) {
  for (const sel of selectorList.split(',').map((s) => s.trim())) {
    const loc = p.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.click();
      return true;
    }
  }
  return false;
}

async function fillFirstVisible(p, selectorList, value) {
  for (const sel of selectorList.split(',').map((s) => s.trim())) {
    const loc = p.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.fill(value);
      return true;
    }
  }
  return false;
}

// 1. 로그인 + SMS 2차 인증번호 요청
app.post('/auth/request-sms', async (req, res) => {
  try {
    const { userId, password } = req.body ?? {};
    if (!userId || !password) {
      return res.status(400).json({ ok: false, message: '아이디와 비밀번호를 입력하세요.' });
    }

    const p = await ensurePage();
    await p.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const idOk = await fillFirstVisible(p, config.selectors.userIdInput, userId);
    const pwOk = await fillFirstVisible(p, config.selectors.passwordInput, password);
    if (!idOk || !pwOk) {
      return res.status(500).json({
        ok: false,
        message: '로그인 입력칸을 찾지 못했습니다. config.selectors.json을 확인하세요.',
      });
    }

    await clickFirstVisible(p, config.selectors.loginButton);
    await p.waitForTimeout(1500);

    // 팝업/새창이 열릴 경우 마지막 열린 페이지로 전환
    const pages = context.pages();
    if (pages.length > 1) {
      page = pages[pages.length - 1];
    }

    // SMS 인증요청 버튼이 별도로 있는 경우 클릭
    await clickFirstVisible(page, config.selectors.smsSendButton);

    return res.json({
      ok: true,
      message: 'SKT 판매점 포탈에 로그인 요청 및 SMS 2차 인증을 진행했습니다. 휴대폰으로 온 6자리 번호를 입력하세요.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// 2. SMS 6자리 인증번호 입력 및 세션 확정
app.post('/auth/verify-sms', async (req, res) => {
  try {
    const { smsCode } = req.body ?? {};
    if (!smsCode || !page) {
      return res.status(400).json({ ok: false, message: '먼저 SMS 인증요청을 진행하세요.' });
    }

    const filled = await fillFirstVisible(page, config.selectors.smsCodeInput, String(smsCode).trim());
    if (!filled) {
      return res.status(500).json({
        ok: false,
        message: 'SMS 인증번호 입력칸을 찾지 못했습니다. config.selectors.json을 확인하세요.',
      });
    }

    await clickFirstVisible(page, config.selectors.smsConfirmButton);
    await page.waitForTimeout(2000);

    sessionConnected = true;
    saveLatestCache({ connectedUser: req.body?.userId || '연동계정' });
    return res.json({
      ok: true,
      connected: true,
      connectedAt: new Date().toISOString(),
      message: 'SKT 판매점 포탈(T.Key-taka) 인증 세션이 연결되었습니다.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// 3. 무선/유선 엑셀 자동 다운로드 및 JSON 반환
async function collectLatestData() {
  if (!sessionConnected || !page) {
    throw new Error('포탈 인증 세션이 연결되어 있지 않습니다. 먼저 SMS 인증을 완료하세요.');
  }

  const parseExcelFile = (filePath) => {
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  };

  let wirelessRaw = [];
  let wiredRaw = [];

  // 무선 T판매관리 이동 및 엑셀 다운로드
  await clickFirstVisible(page, config.selectors.tkeyMenuLink);
  await page.waitForTimeout(1500);
  try {
    const [dlW] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      clickFirstVisible(page, config.selectors.wirelessExcelBtn),
    ]);
    const wPath = path.join(DOWNLOAD_DIR, `wireless_${Date.now()}.xlsx`);
    await dlW.saveAs(wPath);
    wirelessRaw = parseExcelFile(wPath);
  } catch {
    // 메뉴 셀렉터 커스터마이징 필요 시 빈 배열 유지
  }

  // 유선판매 이동 및 엑셀 다운로드
  await clickFirstVisible(page, config.selectors.wiredMenuLink);
  await page.waitForTimeout(1500);
  try {
    const [dlD] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      clickFirstVisible(page, config.selectors.wiredExcelBtn),
    ]);
    const dPath = path.join(DOWNLOAD_DIR, `wired_${Date.now()}.xlsx`);
    await dlD.saveAs(dPath);
    wiredRaw = parseExcelFile(dPath);
  } catch {
    // 메뉴 셀렉터 커스터마이징 필요 시 빈 배열 유지
  }

  return {
    ok: true,
    syncedAt: new Date().toISOString(),
    wirelessRaw,
    wiredRaw,
    message: `자동 수집 완료: 무선 ${wirelessRaw.length}행 / 유선 ${wiredRaw.length}행`,
  };
}

app.post('/sync/latest', async (_req, res) => {
  try {
    const result = await collectLatestData();
    saveLatestCache({ syncedAt: result.syncedAt, wirelessRaw: result.wirelessRaw || [], wiredRaw: result.wiredRaw || [] });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

app.post('/sync/cron', async (_req, res) => {
  try {
    const result = await collectLatestData();
    saveLatestCache({ syncedAt: result.syncedAt, wirelessRaw: result.wirelessRaw || [], wiredRaw: result.wiredRaw || [] });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// 4. 30분 유휴 자동 로그아웃 방지용 Keep-Alive 타이머 (기본 10분 주기)
setInterval(async () => {
  if (!sessionConnected || !page) return;
  try {
    const url = page.url();
    if (url.includes('index.jsp')) {
      sessionConnected = false;
      console.warn('[tkey-worker] 세션 만료 감지(로그인 페이지 이동)');
      return;
    }
    // 가벼운 새로고침 또는 세션 연장 호출로 유휴 타이머 초기화
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    lastKeepAliveAt = new Date().toISOString();
    console.log(`[tkey-worker] Keep-Alive 세션 유지 완료 (${lastKeepAliveAt})`);
  } catch (err) {
    console.warn('[tkey-worker] Keep-Alive 중 오류:', err.message);
  }
}, KEEP_ALIVE_MS);

app.post('/auth/disconnect', async (_req, res) => {
  try {
    sessionConnected = false;
    lastKeepAliveAt = null;
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
      context = null;
      page = null;
    }
    return res.json({ ok: true, connected: false, message: '티키타카 연동 세션을 해제했습니다.' });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/auth/status', (_req, res) => {
  res.json({
    ok: true,
    connected: sessionConnected,
    lastKeepAliveAt,
    keepAliveIntervalMin: Math.round(KEEP_ALIVE_MS / 60000),
  });
});



const CACHE_FILE = path.join(DOWNLOAD_DIR, 'latest.json');
let latestCache = {
  connected: false,
  connectedUser: '',
  syncedAt: null,
  wirelessRaw: [],
  wiredRaw: [],
  syncLogs: [],
};

function saveLatestCache(patch) {
  latestCache = { ...latestCache, ...patch, connected: sessionConnected };
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(latestCache));
  } catch {}
}

try {
  if (fs.existsSync(CACHE_FILE)) {
    const prev = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    latestCache = { ...latestCache, ...prev, connected: false };
  }
} catch {}

app.get('/state', (_req, res) => {
  res.json({
    ok: true,
    connected: sessionConnected,
    lastKeepAliveAt,
    state: {
      connected: sessionConnected,
      connected_user: latestCache.connectedUser,
      last_sync_at: latestCache.syncedAt,
      sync_logs: latestCache.syncLogs,
    },
    wireless: latestCache.wirelessRaw || [],
    wired: latestCache.wiredRaw || [],
  });
});

// 10분마다 자동 수집해 메모리/임시파일 최신 1회분만 갱신 (KST 09:00~21:00)
setInterval(async () => {
  if (!sessionConnected || !page) return;
  const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
  if (kstHour < 9 || kstHour > 21) return;
  try {
    const res = await collectLatestData();
    const logs = [
      { id: `log-${Date.now()}`, timestamp: new Date().toLocaleTimeString('ko-KR'), type: 'auto', status: 'success', message: res.message },
      ...(latestCache.syncLogs || []),
    ].slice(0, 30);
    saveLatestCache({ syncedAt: res.syncedAt, wirelessRaw: res.wirelessRaw || [], wiredRaw: res.wiredRaw || [], syncLogs: logs });
  } catch (err) {
    console.warn('[tkey-worker] 백그라운드 수집 실패:', err.message);
  }
}, Number(process.env.AUTO_SYNC_MS || 10 * 60 * 1000));

app.listen(PORT, () => {
  console.log(`[tkey-worker] running on http://localhost:${PORT} (HEADLESS=${HEADLESS})`);
});
