@echo off
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
echo [*] Stopping MCP Sentinel servers...
call "%ROOT_DIR%\stop.bat"
timeout /t 2 /nobreak >nul 2>&1
echo [*] Starting fresh MCP Sentinel servers...
call "%ROOT_DIR%\start.bat"
