@echo off
if exist "%~dp0ClipboardShelf.exe" (
    start "" "%~dp0ClipboardShelf.exe"
    exit /b
)
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0Start.ps1"
