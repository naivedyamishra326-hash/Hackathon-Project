@echo off
setlocal
title MCP Sentinel - Process Stopper
color 0C
cls

echo ==============================================================================
echo                MCP SENTINEL - SHUTTING DOWN SERVERS
echo ==============================================================================
echo.

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo [*] Terminating servers on Port 3100 (API Server) and Port 5173 (Vite)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Also terminate any terminal windows created by MCP Sentinel launcher
taskkill /F /FI "WINDOWTITLE eq MCP Sentinel - API Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq MCP Sentinel - Vite Dashboard*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq MCP Sentinel - Dashboard*" >nul 2>&1

echo.
echo [DONE] All MCP Sentinel server processes and windows have been stopped.
echo ==============================================================================
echo.
