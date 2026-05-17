@echo off
REM NZA-PV launcher — installs deps if needed, then runs the dev server.
setlocal
cd /d "%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm not found on PATH. Install it with: npm install -g pnpm
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call pnpm install || exit /b 1
)

if not exist apps\web\node_modules (
  echo Installing web app dependencies...
  call pnpm install || exit /b 1
)

echo Starting NZA-PV dev server on http://localhost:5173 ...
call pnpm dev
