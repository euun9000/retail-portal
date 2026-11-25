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
let lastDialogMessage = '';
let isAuthBusy = false;
const KEEP_ALIVE_MS = Number(process.env.KEEP_ALIVE_MS || 5 * 60 * 1000);

process.on('uncaughtException', (err) => {
  console.error('[tkey-worker] 예외 복구:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[tkey-worker] 비동기 예외 복구:', err);
});

function attachDialogHandler(p) {
  p.on('dialog', async (dialog) => {
    lastDialogMessage = dialog.message();
    console.log('[tkey-worker] 포탈 알림창:', lastDialogMessage);
    await dialog.accept().catch(() => {});
  });
}

async function resetSessionPage() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
  }
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
    ],
  });
  context = await browser.newContext({
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  context.on('page', (newPage) => {
    attachDialogHandler(newPage);
  });
  page = await context.newPage();
  attachDialogHandler(page);
  return page;
}

async function clickFirstVisible(p, selectorList) {
  const targets = [p, ...p.frames()];
  for (const target of targets) {
    for (const sel of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
      const loc = target.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        await loc.click();
        return true;
      }
    }
  }
  return false;
}

async function fillFirstVisible(p, selectorList, value) {
  const targets = [p, ...p.frames()];
  for (const target of targets) {
    for (const sel of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
      const loc = target.locator(sel).first();
      if (
        (await loc.count().catch(() => 0)) > 0 &&
        (await loc.isVisible().catch(() => false)) &&
        (await loc.isEditable().catch(() => false))
      ) {
        await loc.fill(value);
        return loc;
      }
    }
  }
  return null;
}

async function inspectScreen(p) {
  const targets = [p, ...p.frames()];
  const buttons = [];
  const inputs = [];
  const texts = [];
  for (const target of targets) {
    try {
      const info = await target.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll('button, a, input[type="button"], input[type="submit"], input[type="image"], img[onclick], span[onclick], div[onclick], td[onclick]')
        )
          .filter((el) => el.offsetParent !== null)
          .map((el) => {
            const label = (
              el.innerText ||
              el.value ||
              el.alt ||
              el.title ||
              el.getAttribute('aria-label') ||
              el.getAttribute('onclick') ||
              el.getAttribute('href') ||
              el.getAttribute('src') ||
              ''
            ).trim();
            return label;
          })
          .filter(Boolean);
        const ins = Array.from(document.querySelectorAll('input'))
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({
            type: el.type,
            name: el.name,
            id: el.id,
            readonly: el.readOnly,
            placeholder: el.placeholder,
          }));
        const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        return { btns, ins, txt };
      });
      buttons.push(...info.btns);
      inputs.push(...info.ins);
      if (info.txt) texts.push(info.txt);
    } catch {}
  }
  return {
    url: p.url(),
    frameCount: p.frames().length,
    text: texts.join(' | ').slice(0, 600),
    buttons: [...new Set(buttons)].slice(0, 20),
    inputs: inputs.slice(0, 15),
  };
}

// 1. 로그인 + SMS 2차 인증번호 요청
app.post('/auth/request-sms', async (req, res) => {
  if (isAuthBusy) {
    return res.status(429).json({ ok: false, message: '이전 인증 요청이 처리 중입니다. 5초 후 다시 확인하세요.' });
  }
  isAuthBusy = true;
  try {
    const { userId, password } = req.body ?? {};
    if (!userId || !password) {
      return res.status(400).json({ ok: false, message: '아이디와 비밀번호를 입력하세요.' });
    }

    lastDialogMessage = '';
    sessionConnected = false;
    const p = await resetSessionPage();
    await p.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await p.waitForSelector("input[type='password']", { timeout: 7000 }).catch(() => {});

    const idSelector = `${config.selectors.userIdInput}, input[name*='USER' i], input[id*='USER' i], input[placeholder*='ID' i], input[placeholder*='아이디'], input[type='text']:not([readonly])`;
    const pwSelector = `${config.selectors.passwordInput}, input[type='password']`;
    const loginBtnSelector = `${config.selectors.loginButton}, button:has-text('Log in'), input[value*='Log' i], a:has-text('Log in'), button:has-text('로그인'), a:has-text('로그인'), [onclick*='login' i], [onclick*='Login' i]`;
    const smsBtnSelector = `${config.selectors.smsSendButton}, input[value*='요청'], a:has-text('요청'), button:has-text('요청'), button:has-text('인증번호'), button:has-text('문자'), button:has-text('SMS'), button:has-text('발송'), button:has-text('전송'), a:has-text('인증번호'), a:has-text('문자'), a:has-text('SMS'), input[value*='인증'], input[value*='문자'], input[value*='SMS'], [onclick*='sms' i], [onclick*='otp' i], [onclick*='auth' i], [onclick*='cert' i], [onclick*='req' i], [href*='sms' i], [href*='otp' i], img[src*='sms' i], img[src*='otp' i], img[src*='auth' i]`;

    const idLoc = await fillFirstVisible(p, idSelector, userId);
    const pwLoc = await fillFirstVisible(p, pwSelector, password);
    if (!idLoc || !pwLoc) {
      const screen = await inspectScreen(p);
      return res.status(500).json({
        ok: false,
        message: `로그인 입력칸을 찾지 못했습니다. (URL: ${screen.url})`,
      });
    }

    const clickedLogin = await clickFirstVisible(p, loginBtnSelector);
    if (!clickedLogin) {
      await pwLoc.press('Enter').catch(() => {});
    }

    await p.waitForURL((u) => !u.href.includes('UserLogin.html'), { timeout: 6000 }).catch(() => {});
    await p.waitForSelector("#otpNo, input[value*='요청']", { timeout: 2500 }).catch(() => {});

    const pages = context.pages();
    if (pages.length > 1) {
      page = pages[pages.length - 1];
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    } else {
      page = p;
    }

    const screenAfterLogin = await inspectScreen(page);
    if (screenAfterLogin.url.includes('UserLogin.html')) {
      const alertNote = lastDialogMessage ? ` / 포탈 알림: ${lastDialogMessage}` : '';
      return res.status(400).json({
        ok: false,
        message: `로그인 다음 단계로 넘어가지 않았습니다.${alertNote} (버튼: ${screenAfterLogin.buttons.join(', ') || '없음'})`,
      });
    }

    const clickedSms = await clickFirstVisible(page, smsBtnSelector);
    await page.waitForTimeout(800);
    const screenAfterSms = await inspectScreen(page);

    if (!clickedSms) {
      return res.json({
        ok: true,
        message: `화면 이동됨: ${screenAfterSms.text || screenAfterSms.url} | 버튼: ${screenAfterSms.buttons.join(', ') || '없음'}`,
      });
    }

    return res.json({
      ok: true,
      message: `SKT 판매점 포탈에 로그인 및 SMS 인증번호를 요청했습니다. (${screenAfterSms.url}${lastDialogMessage ? ` / 알림: ${lastDialogMessage}` : ''})`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    isAuthBusy = false;
  }
});

// 2. SMS 6자리 인증번호 입력 및 세션 확정
app.post('/auth/verify-sms', async (req, res) => {
  try {
    const { smsCode } = req.body ?? {};
    if (!smsCode || !page) {
      return res.status(400).json({ ok: false, message: '먼저 SMS 인증요청을 진행하세요.' });
    }

    lastDialogMessage = '';
    const smsInputSelector = `#otpNo, input[name='otpNo'], ${config.selectors.smsCodeInput}, input[type='text'], input[type='number'], input[type='tel']`;
    const filled = await fillFirstVisible(page, smsInputSelector, String(smsCode).trim());
    if (!filled) {
      const screen = await inspectScreen(page);
      return res.status(500).json({
        ok: false,
        message: `SMS 인증번호 입력칸을 찾지 못했습니다. (URL: ${screen.url})`,
      });
    }

    await clickFirstVisible(page, `${config.selectors.smsConfirmButton}, input[value*='확인'], a:has-text('확인'), [onclick*='confirm' i], [onclick*='check' i], [onclick*='login' i]`);
    await page.waitForTimeout(2000);

    sessionConnected = true;
    saveLatestCache({ connectedUser: req.body?.userId || '연동계정' });
    return res.json({
      ok: true,
      connected: true,
      connectedAt: new Date().toISOString(),
      message: `SKT 판매점 포탈(T.Key-taka) 인증 세션이 연결되었습니다.${lastDialogMessage ? ` (알림: ${lastDialogMessage})` : ''}`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/debug', async (_req, res) => {
  if (!page) return res.json({ ok: true, active: false });
  const screen = await inspectScreen(page);
  res.json({ ok: true, active: true, lastDialogMessage, ...screen });
});

app.get('/debug-shot', async (_req, res) => {
  if (!page) return res.status(404).send('활성 페이지가 없습니다.');
  const buf = await page.screenshot({ type: 'png', fullPage: true });
  res.type('image/png').send(buf);
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

// 4. 30분 유휴 자동 로그아웃 방지용 Keep-Alive 타이머 (기본 5분 주기)
setInterval(async () => {
  if (!sessionConnected || !page) return;
  try {
    const url = page.url();
    if (url.includes('index.jsp') || url.includes('UserLogin.html')) {
      sessionConnected = false;
      console.warn('[tkey-worker] 세션 만료 감지(로그인 페이지 이동)');
      return;
    }
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
    const result = await collectLatestData();
    const logs = [
      { id: `log-${Date.now()}`, timestamp: new Date().toLocaleTimeString('ko-KR'), type: 'auto', status: 'success', message: result.message },
      ...(latestCache.syncLogs || []),
    ].slice(0, 30);
    saveLatestCache({ syncedAt: result.syncedAt, wirelessRaw: result.wirelessRaw || [], wiredRaw: result.wiredRaw || [], syncLogs: logs });
  } catch (err) {
    console.warn('[tkey-worker] 백그라운드 수집 실패:', err.message);
  }
}, Number(process.env.AUTO_SYNC_MS || 10 * 60 * 1000));

app.listen(PORT, () => {
  console.log(`[tkey-worker] running on http://localhost:${PORT} (HEADLESS=${HEADLESS})`);
});
