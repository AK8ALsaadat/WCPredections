@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;%PATH%
echo Node:
node -v
echo npm:
npm -v
echo.
echo Starting http://localhost:3000 ...
npm run dev
pause
