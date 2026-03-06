@echo off
REM Vulnerability Prioritization Tool — startup script (Windows)
REM Usage: start.bat
REM Starts PocketBase on :8090 and the Vite dev server on :5173.

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend
set FRONTEND_DIR=%SCRIPT_DIR%frontend
set PB_BIN=%BACKEND_DIR%\pocketbase.exe

REM ── PocketBase binary ──────────────────────────────────────────────────────

if not exist "%PB_BIN%" (
  REM NOTE: The migration files use the PocketBase v0.22+ JavaScript migration API
  REM (new TextField(), new RelationField(), etc.). Pinning below v0.22 causes
  REM "TextField is not defined" at startup.
  REM Pinned to v0.36.5 — bump both this and start.sh together when upgrading.
  set PB_VERSION=0.36.5
  echo [start.bat] PocketBase not found -- downloading v!PB_VERSION!...
  set PB_ZIP=%TEMP%\pocketbase_!PB_VERSION!_windows_amd64.zip
  set PB_URL=https://github.com/pocketbase/pocketbase/releases/download/v!PB_VERSION!/pocketbase_!PB_VERSION!_windows_amd64.zip

  echo [start.bat] Downloading !PB_URL! ...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri '!PB_URL!' -OutFile '!PB_ZIP!'"

  echo [start.bat] Extracting...
  powershell -NoProfile -Command "Expand-Archive -Path '!PB_ZIP!' -DestinationPath '%BACKEND_DIR%' -Force"
  del "!PB_ZIP!"

  echo [start.bat] PocketBase v!PB_VERSION! downloaded to %PB_BIN%
)

REM ── Frontend dependencies ───────────────────────────────────────────────────

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [start.bat] Installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install
  popd
)

REM ── Launch services via PowerShell for reliable Ctrl-C cleanup ───────────────
REM PowerShell captures child PIDs and kills them in a try/finally block,
REM which batch cannot do natively. -ExecutionPolicy Bypass is scoped to
REM this invocation only and does not change the system-wide policy.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%_start_services.ps1" ^
  -PbBin "%PB_BIN%" ^
  -BackendDir "%BACKEND_DIR%" ^
  -FrontendDir "%FRONTEND_DIR%"
