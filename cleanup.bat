@echo off
REM Vigil — cleanup script (Windows)
REM Kills any orphaned PocketBase and Vite/node processes left behind
REM after an unclean shutdown.

echo [cleanup] Stopping any running pocketbase.exe processes...
taskkill /F /IM pocketbase.exe >nul 2>nul
if %errorlevel%==0 (
    echo   Killed pocketbase.exe
) else (
    echo   No pocketbase.exe found
)

echo [cleanup] Stopping any process listening on port 5173 (Vite)...
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    echo   Killing PID %%p (port 5173^)
    taskkill /F /T /PID %%p >nul 2>nul
    set FOUND=1
)
if %FOUND%==0 echo   No process found on port 5173

echo [cleanup] Done.
pause
