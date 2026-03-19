# Vigil — process manager (Windows)
# Called by start.bat after download/install steps are complete.
# Launches PocketBase and Vite, captures PIDs, and ensures both are
# killed on Ctrl-C or terminal close via try/finally.

param(
    [Parameter(Mandatory)][string]$PbBin,
    [Parameter(Mandatory)][string]$BackendDir,
    [Parameter(Mandatory)][string]$FrontendDir
)

$ErrorActionPreference = "Stop"

# ── Launch PocketBase ────────────────────────────────────────────────────────

Write-Host "[start] Starting PocketBase on http://localhost:8090 ..."
$pbProcess = Start-Process -FilePath $PbBin -ArgumentList @(
    "serve",
    "--http=localhost:8090",
    "--dir=$BackendDir\pb_data",
    "--migrationsDir=$BackendDir\pb_migrations"
) -NoNewWindow -PassThru

Write-Host "[start] PocketBase started (PID: $($pbProcess.Id))"

# Give PocketBase time to run migrations
Start-Sleep -Seconds 2

# ── Launch Vite dev server ───────────────────────────────────────────────────

Write-Host "[start] Starting Vite dev server on http://localhost:5173 ..."
$viteProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$FrontendDir`" && npm run dev" -NoNewWindow -PassThru

Write-Host "[start] Vite dev server started (PID: $($viteProcess.Id))"
Write-Host ""
Write-Host "  PocketBase admin UI  ->  http://localhost:8090/_/"
Write-Host "  App                  ->  http://localhost:5173"
Write-Host ""
Write-Host "  Press Ctrl-C to stop both services."
Write-Host ""

# ── Wait and clean up on exit ────────────────────────────────────────────────

function Stop-AllServices {
    Write-Host ""
    Write-Host "[start] Shutting down... please wait."

    # Kill PocketBase
    if ($pbProcess -and -not $pbProcess.HasExited) {
        try {
            Stop-Process -Id $pbProcess.Id -Force -ErrorAction SilentlyContinue
            Write-Host "[start] PocketBase stopped."
        } catch { }
    }

    # Kill the Vite process tree (cmd -> node -> esbuild)
    # /T kills the entire tree, /F forces termination
    if ($viteProcess -and -not $viteProcess.HasExited) {
        try {
            & taskkill /F /T /PID $viteProcess.Id 2>$null | Out-Null
            Write-Host "[start] Vite dev server stopped."
        } catch { }
    }

    Write-Host "[start] All services stopped."
}

try {
    # Wait for either process to exit on its own (crash, etc.)
    while (-not $pbProcess.HasExited -and -not $viteProcess.HasExited) {
        Start-Sleep -Milliseconds 500
    }

    # If we get here, one process exited unexpectedly
    if ($pbProcess.HasExited) {
        Write-Host "[start] PocketBase exited unexpectedly (exit code: $($pbProcess.ExitCode))."
    }
    if ($viteProcess.HasExited) {
        Write-Host "[start] Vite exited unexpectedly (exit code: $($viteProcess.ExitCode))."
    }
} finally {
    # Runs on Ctrl-C, terminal close, or normal exit
    Stop-AllServices
}
