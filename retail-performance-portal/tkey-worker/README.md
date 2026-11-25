# T.Key-taka (SKT 판매점 포탈) 자동 수집 워커

`https://www.jungboboho.com/ciespp/index.jsp` 에 접속해 아이디/비밀번호 로그인, SMS 2차 인증, 무선(`T판매관리`)·유선(`유선판매`) 엑셀 자동 다운로드를 수행하는 Playwright 워커입니다.

## 실행 방법

```bash
cd tkey-worker
npm install
npx playwright install chromium
npm start
```

- 기본 포트: `http://localhost:4000`
- 기본 모드는 `HEADLESS=false`로 브라우저 창이 직접 열리므로, 로그인 후 내부 메뉴의 버튼/링크가 다를 경우 화면을 보며 `config.selectors.json`의 셀렉터를 한 번만 맞춰주시면 됩니다.
- Vercel에 배포한 웹앱과 연결할 때는 Cloudflare Tunnel(`cloudflared tunnel --url http://localhost:4000`)이나 ngrok 주소를 Vercel 환경변수 `TKEY_BASE_URL`에 등록하세요.
