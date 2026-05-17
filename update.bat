@echo off
REM Pull latest, update dependencies, and rerun checks.
setlocal
cd /d "%~dp0"

echo Pulling from origin...
git pull --rebase || exit /b 1

echo Updating dependencies...
call pnpm install || exit /b 1

echo Running typecheck...
call pnpm typecheck || exit /b 1

echo Running tests...
call pnpm test || exit /b 1

echo Update complete.
