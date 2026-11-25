@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 소매 통합실적관리 (내 PC 바로실행)

echo ==================================================
echo   소매 통합실적관리 + 티키타카 워커 원클릭 실행
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [안내] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 더블클릭해 주세요.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo TKEY_BASE_URL=http://localhost:4000> .env.local
)

if not exist "node_modules" (
  echo [1/3] 웹 포털 필수 모듈 설치 중... ^(최초 1회만 진행^)
  call npm install
  if errorlevel 1 (
    echo [오류] 웹 포털 모듈 설치 실패
    pause
    exit /b 1
  )
)

if not exist "tkey-worker\node_modules" (
  echo [2/3] 티키타카 워커 설치 중... ^(최초 1회만 진행^)
  pushd tkey-worker
  call npm install
  call npx playwright install chromium
  popd
)

echo [3/3] 티키타카 워커와 웹 포털을 실행합니다...
start "티키타카 워커" cmd /k "cd /d "%~dp0tkey-worker" && node server.mjs"
timeout /t 2 >nul
start "" "http://localhost:3000"
call npm run dev
pause
