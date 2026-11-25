@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Vercel 연결용 외부 터널 (Cloudflare)

echo ==================================================
echo   Vercel 연결용 HTTPS 주소 생성 (Cloudflare Tunnel)
echo ==================================================
echo.

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo [안내] cloudflared가 설치되어 있지 않습니다.
  echo 아래 명령을 CMD에서 1회 실행해 설치한 뒤 다시 열어주세요:
  echo   winget install --id Cloudflare.cloudflared
  echo.
  pause
  exit /b 1
)

echo 아래에 나오는 https://...trycloudflare.com 주소를 복사해
echo Vercel 환경변수 TKEY_BASE_URL 에 넣어주세요.
echo.
cloudflared tunnel --url http://localhost:4000
pause
