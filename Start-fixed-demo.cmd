@echo off
setlocal
cd /d "%~dp0prototype"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.19+ or 22.12+ is required.
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Fixed build preview: http://127.0.0.1:4173/
call npm run preview -- --open --strictPort
pause
