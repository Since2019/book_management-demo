@echo off
cd /d "%~dp0"
if not exist "scripts\import-local-db.py" exit /b 1
py -3 "scripts\import-local-db.py"
if errorlevel 1 pause
