@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org , then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo Starting Block Duel. Leave this window open while you play.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/"
node server.js
echo.
echo The server stopped. Any message above says why.
pause
