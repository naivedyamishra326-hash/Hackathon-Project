@echo off
setlocal enabledelayedexpansion
title MCP Sentinel - System Launcher
color 0B
cls

echo ==============================================================================
echo        MCP SENTINEL - ZERO-TRUST AGENTIC SIDECAR (ZTAS)
echo        Enterprise Runtime Security for MCP-Connected AI Agents
echo ==============================================================================
echo.

:: 1. Verify Node.js and npm
echo [*] Checking environment prerequisites...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js (v20 or higher) from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not found in PATH!
    pause
    exit /b 1
)

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [*] node_modules not detected. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check network connection.
        pause
        exit /b 1
    )
)

echo [OK] Environment verified.
echo.

:: 2. Launch API Server in separate window
echo [*] Starting MCP Sentinel API Server on Port 3100...
start "MCP Sentinel - API Server (Port 3100)" cmd /k "title MCP Sentinel - API Server (Port 3100) && cd /d "%ROOT_DIR%" && npm run dev:api"

:: 3. Launch Vite Dashboard in separate window
echo [*] Starting MCP Sentinel Dashboard on Port 5173...
start "MCP Sentinel - Dashboard (Port 5173)" cmd /k "title MCP Sentinel - Dashboard (Port 5173) && cd /d "%ROOT_DIR%" && npm run dev:dashboard"

echo.
echo ==============================================================================
echo    SUCCESS: Both servers are starting up in dedicated terminal windows!
echo ==============================================================================
echo.
echo   * Web Dashboard:  http://localhost:5173
echo   * API Backend:    http://localhost:3100
echo   * SSE Stream:     http://localhost:3100/api/events/stream
echo.
echo Waiting 5 seconds for services to initialize...
ping -n 6 127.0.0.1 >nul

echo [*] Opening Dashboard in default web browser...
start http://localhost:5173

:MENU
echo.
echo ==============================================================================
echo   QUICK COMMANDS:
echo   [1] Open Dashboard in Browser (http://localhost:5173)
echo   [2] View API Status in Browser (http://localhost:3100/api/circuit-breaker)
echo   [3] Stop All Running Servers
echo   [4] Exit this launcher window
echo ==============================================================================
set /p CHOICE="Enter option [1-4]: "

if "%CHOICE%"=="1" (
    start http://localhost:5173
    goto MENU
)
if "%CHOICE%"=="2" (
    start http://localhost:3100/api/circuit-breaker
    goto MENU
)
if "%CHOICE%"=="3" (
    call "%ROOT_DIR%stop.bat"
    goto MENU
)
if "%CHOICE%"=="4" (
    echo Exiting launcher. Bye!
    exit /b 0
)

echo Invalid choice, please enter 1, 2, 3, or 4.
goto MENU
