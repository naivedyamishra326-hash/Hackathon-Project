@echo off
set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

title MCP Sentinel - GitHub Push
color 0A
cls

echo ==============================================================================
echo                 MCP SENTINEL - PUSHING CODE TO GITHUB
echo ==============================================================================
echo.
echo Current branch:
git branch --show-current
echo.
echo Latest commit to push:
git log -n 1 --oneline
echo.
echo [*] Pushing to origin main...
git push origin main
echo.
if %errorlevel% equ 0 (
    echo ==============================================================================
    echo [SUCCESS] Codebase has been successfully updated on GitHub!
    echo ==============================================================================
) else (
    echo ==============================================================================
    echo [NOTICE] If Git asked for authentication, please complete the sign-in in 
    echo your browser or enter your GitHub Personal Access Token (PAT).
    echo ==============================================================================
)
echo.
pause
