@echo off
REM Vulnerability Prioritization Tool — database backup script (Windows)
REM Copies backend\pb_data to a timestamped folder under backups\.

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PB_DATA=%SCRIPT_DIR%backend\pb_data
set BACKUP_DIR=%SCRIPT_DIR%backups

REM ── Check pb_data exists ────────────────────────────────────────────────────

if not exist "%PB_DATA%" (
    echo [backup] ERROR: backend\pb_data not found. Nothing to back up.
    echo   Run the application at least once so PocketBase creates the database.
    pause
    exit /b 1
)

REM ── Warn if PocketBase is running ───────────────────────────────────────────

tasklist /FI "IMAGENAME eq pocketbase.exe" 2>nul | findstr /I "pocketbase.exe" >nul
if %errorlevel%==0 (
    echo [backup] WARNING: PocketBase appears to be running.
    echo   Backing up while the database is in use may produce an inconsistent snapshot.
    echo   For a clean backup, stop PocketBase first (Ctrl-C in the start window^).
    echo.
    set /p CONTINUE="  Continue anyway? (y/N): "
    if /i not "!CONTINUE!"=="y" (
        echo [backup] Aborted.
        pause
        exit /b 0
    )
)

REM ── Build timestamp ─────────────────────────────────────────────────────────

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set TIMESTAMP=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%%DT:~10,2%

set DEST=%BACKUP_DIR%\pb_data_%TIMESTAMP%

REM ── Copy ────────────────────────────────────────────────────────────────────

echo [backup] Copying backend\pb_data -^> backups\pb_data_%TIMESTAMP% ...
xcopy "%PB_DATA%" "%DEST%\" /E /I /Q /Y >nul
echo [backup] Done. Backup saved to: %DEST%
pause
