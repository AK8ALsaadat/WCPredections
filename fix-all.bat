@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0fix-all.ps1"
pause
