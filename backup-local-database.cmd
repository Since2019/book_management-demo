@echo off
cd /d "%~dp0"
if not exist "scripts\backup-local-db.py" exit /b 1
py -3 "scripts\backup-local-db.py"
if errorlevel 1 pause
