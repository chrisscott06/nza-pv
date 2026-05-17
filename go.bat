@echo off
REM NZA-PV launcher — installs deps if needed, then runs the dev server.
REM Stays open on error so you can read what went wrong.
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo === NZA-PV launcher ===
echo Working dir: %CD%
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm was not found on PATH.
  echo.
  echo Install it once with one of these, in an Admin or normal terminal:
  echo   npm install -g pnpm
  echo   iwr https://get.pnpm.io/install.ps1 -useb ^| iex
  echo.
  echo Then re-run this launcher.
  goto :hold
)

for /f "tokens=*" %%v in ('pnpm --version 2^>nul') do set "PNPM_V=%%v"
echo Using pnpm !PNPM_V!
where node >nul 2>&1 && for /f "tokens=*" %%v in ('node --version 2^>nul') do echo Using node %%v
echo.

if not exist node_modules (
  echo Installing dependencies ^(first run^)...
  call pnpm install
  if errorlevel 1 (
    echo.
    echo [ERROR] pnpm install failed with exit code !errorlevel!.
    goto :hold
  )
)

if not exist apps\web\node_modules (
  echo Re-syncing workspace dependencies...
  call pnpm install
  if errorlevel 1 (
    echo.
    echo [ERROR] pnpm install failed with exit code !errorlevel!.
    goto :hold
  )
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo [ERROR] Port 5173 is already in use.
  echo Something else is bound to it — likely a previous dev server.
  echo Close it or find the PID with:  netstat -ano ^| findstr ":5173"
  echo Then kill it with:              taskkill /PID ^<pid^> /F
  goto :hold
)

echo.
echo Starting NZA-PV dev server on http://localhost:5173 ...
echo Press Ctrl+C to stop.
echo.
call pnpm dev
set "DEV_EXIT=!errorlevel!"
echo.
if not "!DEV_EXIT!"=="0" (
  echo [ERROR] pnpm dev exited with code !DEV_EXIT!.
) else (
  echo Dev server stopped.
)

:hold
echo.
echo Press any key to close this window.
pause >nul
endlocal
