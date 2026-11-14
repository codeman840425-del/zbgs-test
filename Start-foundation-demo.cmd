@echo off
setlocal
cd /d "%~dp0prototype"
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo M1A fixed preview: http://127.0.0.1:4191/
echo If port 4191 is already serving a fixed candidate, open that address directly.
call npm run preview -- --port 4191 --strictPort --open
pause
