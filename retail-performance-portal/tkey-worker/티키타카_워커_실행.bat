@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 티키타카 자동연동 워커 (4000번 포트)

echo ==================================================
echo   SKT 판매점 포탈(티키타카) 자동연동 워커 실행
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 먼저 설치해 주세요.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] 필수 모듈 설치 중... ^(최초 1회만 진행^)
  call npm install
  if errorlevel 1 (
    echo [오류] npm install 실패
    pause
    exit /b 1
  )
  echo.
  echo [2/2] 크롬 브라우저 모듈 설치 중...
  call npx playwright install chromium
  if errorlevel 1 (
    echo [오류] playwright chromium 설치 실패
    pause
    exit /b 1
  )
)

echo.
echo 워커를 시작합니다. 이 창은 켜둔 상태로 유지해 주세요.
echo 주소: http://localhost:4000
echo.
node server.mjs
pause
