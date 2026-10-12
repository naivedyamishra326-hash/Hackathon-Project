@echo off
setlocal
echo ==============================================================================
echo                MCP SENTINEL - STOPPING RUNNING SERVERS
echo ==============================================================================
echo.

echo [*] Stopping processes on Port 3100 (API Server)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3100" ^| findstr "LISTENING"') do (
    echo     Terminating process PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Stopping processes on Port 5173 (Vite Dashboard)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo     Terminating process PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [DONE] All MCP Sentinel server processes stopped.
echo ==============================================================================
