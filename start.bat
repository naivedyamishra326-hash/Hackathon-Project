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

:: 1. Normalize root directory without trailing backslash (prevents Windows cmd quote bugs)
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

:: 2. Verify Node.js and npm
echo [*] Checking environment prerequisites...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js v20 or higher from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not found in PATH!
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo [OK] Node.js detected: %NODE_VERSION%
echo [OK] Project directory: %ROOT_DIR%
echo.

:: 3. Free up any previous hanging processes on ports 3100 and 5173
echo [*] Cleaning previous server instances on ports 3100 and 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3100,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [OK] Ports 3100 and 5173 are clean and ready.
echo.

:: 4. Verify dependencies
if not exist "node_modules\" (
    echo [*] node_modules not detected. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
)

:: 5. Verify .env file exists
if not exist ".env" (
    if exist ".env.example" (
        echo [*] .env not found. Creating from .env.example...
        copy ".env.example" ".env" >nul
        echo [!] Created .env file. Add your GEMINI_API_KEY in .env for real AI responses.
    )
)

:: 6. Launch Backend API Server in dedicated window
echo [*] Launching API Server on Port 3100...
start "MCP Sentinel - API Backend" /D "%ROOT_DIR%" cmd /k "title MCP Sentinel - API Backend (Port 3100) && echo Starting API Backend on Port 3100... && npm run dev:api"

:: 7. Launch Vite Frontend Dashboard in dedicated window
echo [*] Launching Frontend Dashboard on Port 5173...
start "MCP Sentinel - Dashboard" /D "%ROOT_DIR%" cmd /k "title MCP Sentinel - Vite Dashboard (Port 5173) && echo Starting Dashboard on Port 5173... && npm run dev:dashboard"

echo.
echo ==============================================================================
echo    SUCCESS: Both servers are starting up in dedicated terminal windows!
echo ==============================================================================
echo.
echo   * Main Dashboard:    http://localhost:5173
echo   * Account Portal:    http://localhost:5173/accounts
echo   * AI Finance Bot:    http://localhost:5173/finance
echo   * Backend API:       http://localhost:3100
echo   * SSE Live Stream:   http://localhost:3100/api/events/stream
echo.
echo Waiting 4 seconds for services to initialize...
timeout /t 4 /nobreak >nul 2>&1

echo [*] Opening Dashboard in default web browser...
start http://localhost:5173

:MENU
echo.
echo ==============================================================================
echo   QUICK COMMANDS:
echo   [1] Open Dashboard (http://localhost:5173)
echo   [2] Open Account Management Portal (http://localhost:5173/accounts)
echo   [3] Open AI Finance Bot (http://localhost:5173/finance)
echo   [4] Check Backend Status in Browser (http://localhost:3100/api/finance/status)
echo   [5] Restart All Servers
echo   [6] Stop All Running Servers
echo   [7] Exit this launcher window
echo ==============================================================================
set "CHOICE="
set /p CHOICE="Enter option [1-7] (or press Enter to exit): "

if not defined CHOICE (
    echo Launcher window closed. Servers will remain active in their windows.
    exit /b 0
)

if "%CHOICE%"=="1" (
    start http://localhost:5173
    goto MENU
)
if "%CHOICE%"=="2" (
    start http://localhost:5173/accounts
    goto MENU
)
if "%CHOICE%"=="3" (
    start http://localhost:5173/finance
    goto MENU
)
if "%CHOICE%"=="4" (
    start http://localhost:3100/api/finance/status
    goto MENU
)
if "%CHOICE%"=="5" (
    echo [*] Restarting servers...
    call "%ROOT_DIR%\stop.bat"
    timeout /t 2 /nobreak >nul 2>&1
    call "%ROOT_DIR%\start.bat"
    exit /b 0
)
if "%CHOICE%"=="6" (
    call "%ROOT_DIR%\stop.bat"
    goto MENU
)
if "%CHOICE%"=="7" (
    echo Launcher window closed. Servers will remain active in their windows.
    exit /b 0
)

echo Invalid choice: '%CHOICE%'. Please enter a number between 1 and 7.
goto MENU
