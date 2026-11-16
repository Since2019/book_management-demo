@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1"
set "SCRIPT_EXIT=%ERRORLEVEL%"

echo.
pause
exit /b %SCRIPT_EXIT%
