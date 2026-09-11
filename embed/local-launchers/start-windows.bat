@echo off
rem SunDesk web - one-click local server for Windows.
rem Double-click this file; the browser opens http://localhost:8080 automatically.
rem Requires Python (the same python used for "python -m http.server").

cd /d "%~dp0"

echo Starting SunDesk local server...
start "SunDesk local server" /min python -m http.server 8080

rem Wait briefly so the server is ready before the browser connects.
timeout /t 2 /nobreak >nul

start "" http://localhost:8080

echo.
echo ============================================================
echo  SunDesk is open in your browser:  http://localhost:8080
echo  To stop the server, close the minimized
echo  "SunDesk local server" window.
echo ============================================================
echo.
pause
