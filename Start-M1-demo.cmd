@echo off
setlocal
cd /d "%~dp0prototype"
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run build
if errorlevel 1 exit /b 1
echo M1 fixed build: http://127.0.0.1:4191/
echo If 4191 is already serving the candidate, open that address instead.
call npm run preview -- --port 4191 --strictPort --open
