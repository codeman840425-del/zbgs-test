@echo off
setlocal
cd /d "%~dp0prototype"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js LTS and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run dev -- --open --strictPort
pause
