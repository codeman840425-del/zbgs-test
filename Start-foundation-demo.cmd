@echo off
setlocal
cd /d "%~dp0prototype"
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build -- --outDir ../output/foundation-dist --emptyOutDir
if errorlevel 1 (
  pause
  exit /b 1
)
echo Foundation preview: http://127.0.0.1:4192/
call npm run preview -- --outDir ../output/foundation-dist --port 4192 --strictPort --open
pause
