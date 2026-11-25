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
const KEEP_ALIVE_MS = Number(process.env.KEEP_ALIVE_MS || 5 * 60 * 1000);

process.on('uncaughtException', (err) => console.error('[tkey-worker] 예외 복구:', err.message));
process.on('unhandledRejection', (err) => console.error('[tkey-worker] 비동기 예외 복구:', err));

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
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(latestCache)); } catch {}
}

async function ensurePage() {
  if (!browser) {
    browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    context = await browser.newContext({ acceptDownloads: true, ignoreHTTPSErrors: true });
    page = await context.newPage();
  }
  return page;
}

async function findInAllFrames(p, selectorList) {
  const frames = [p, ...p.frames()];
  for (const frame of frames) {
    for (const sel of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const loc = frame.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          return loc;
        }
      } catch {}
    }
  }
  return null;
}

async function fillFirstVisible(p, selectorList, value) {
  const loc = await findInAllFrames(p, selectorList);
  if (!loc) return false;
  await loc.fill(value);
  return true;
}

async function clickFirstVisible(p, selectorList) {
  const loc = await findInAllFrames(p, selectorList);
  if (!loc) return false;
  await loc.click();
  return true;
}

app.post('/auth/request-sms', async (req, res) => {
  try {
    const { userId, password } = req.body ?? {};
    if (!userId || !password) {
      return res.status(400).json({ ok: false, message: '아이디와 비밀번호를 입력하세요.' });
    }

    const p = await ensurePage();
    await p.goto(config.loginUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2000);

    const idSelectors = `${config.selectors.userIdInput}, input:not([type='hidden']):not([type='password']):not([type='submit']):not([type='button'])`;
    const pwSelectors = `${config.selectors.passwordInput}, input[type='password']`;
    const btnSelectors = `${config.selectors.loginButton}, input[type='image'], button:has-text('Log'), a:has-text('Log'), a:has-text('로그인')`;

    const idOk = await fillFirstVisible(p, idSelectors, userId);
    const pwOk = await fillFirstVisible(p, pwSelectors, password);
    if (!idOk || !pwOk) {
      const url = p.url();
      return res.status(500).json({
        ok: false,
        message: `로그인 입력칸을 찾지 못했습니다. (현재 접속 URL: ${url})`,
      });
    }

    await clickFirstVisible(p, btnSelectors);
    await p.waitForTimeout(2500);

    const pages = context.pages();
    if (pages.length > 1) page = pages[pages.length - 1];

    await clickFirstVisible(page, config.selectors.smsSendButton);

    return res.json({
      ok: true,
      message: 'SKT 판매점 포탈에 로그인 요청 및 SMS 2차 인증을 진행했습니다. 휴대폰으로 온 6자리 번호를 입력하세요.',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

app.post('/auth/verify-sms', async (req, res) => {
  try {
    const { smsCode } = req.body ?? {};
    if (!smsCode || !page) {
      return res.status(400).json({ ok: false, message: '먼저 SMS 인증요청을 진행하세요.' });
    }
    const filled = await fillFirstVisible(page, `${config.selectors.smsCodeInput}, input[type='text']`, String(smsCode).trim());
    if (!filled) {
      return res.status(500).json({ ok: false, message: `SMS 인증번호 입력칸을 찾지 못했습니다. (URL: ${page.url()})` });
    }
    await clickFirstVisible(page, config.selectors.smsConfirmButton);
    await page.waitForTimeout(2500);
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

async function collectLatestData() {
  if (!sessionConnected || !page) {
    throw new Error('포탈 인증 세션이 연결되어 있지 않습니다.');
  }
  const parseExcelFile = (filePath) => {
    const wb = XLSX.readFile(filePath, { cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  };
  let wirelessRaw = [], wiredRaw = [];
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
  } catch {}
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
  } catch {}
  return { ok: true, syncedAt: new Date().toISOString(), wirelessRaw, wiredRaw, message: `자동 수집 완료: 무선 ${wirelessRaw.length}행 / 유선 ${wiredRaw.length}행` };
}

app.post('/sync/latest', async (_req, res) => {
  try {
    const result = await collectLatestData();
    saveLatestCache({ syncedAt: result.syncedAt, wirelessRaw: result.wirelessRaw || [], wiredRaw: result.wiredRaw || [] });
    return res.json(result);
  } catch (err) { return res.status(500).json({ ok: false, message: err.message }); }
});

app.post('/sync/cron', async (_req, res) => {
  try {
    const result = await collectLatestData();
    saveLatestCache({ syncedAt: result.syncedAt, wirelessRaw: result.wirelessRaw || [], wiredRaw: result.wiredRaw || [] });
    return res.json(result);
  } catch (err) { return res.status(500).json({ ok: false, message: err.message }); }
});

app.post('/auth/disconnect', async (_req, res) => {
  sessionConnected = false;
  lastKeepAliveAt = null;
  if (browser) { await browser.close().catch(() => {}); browser = null; context = null; page = null; }
  return res.json({ ok: true, connected: false, message: '연동을 해제했습니다.' });
});

app.get('/auth/status', (_req, res) => {
  res.json({ ok: true, connected: sessionConnected, lastKeepAliveAt, keepAliveIntervalMin: Math.round(KEEP_ALIVE_MS / 60000) });
});

app.get('/state', (_req, res) => {
  res.json({
    ok: true, connected: sessionConnected, lastKeepAliveAt,
    state: { connected: sessionConnected, connected_user: latestCache.connectedUser, last_sync_at: latestCache.syncedAt, sync_logs: latestCache.syncLogs },
    wireless: latestCache.wirelessRaw || [], wired: latestCache.wiredRaw || [],
  });
});

setInterval(async () => {
  if (!sessionConnected || !page) return;
  try {
    if (page.url().includes('index.jsp') || page.url().includes('UserLogin')) { sessionConnected = false; return; }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    lastKeepAliveAt = new Date().toISOString();
  } catch {}
}, KEEP_ALIVE_MS);

app.listen(PORT, () => console.log(`[tkey-worker] running on port ${PORT}`));
