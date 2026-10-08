@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-zoz-pro.ps1"
if errorlevel 1 (
  echo.
  echo ZOZ Pro could not be started. Read the error above.
  pause
)
endlocal