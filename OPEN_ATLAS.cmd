@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_8K_AND_LAUNCH.ps1"
if errorlevel 1 (
  echo.
  echo ATLAS could not start. See the error above.
  pause
)
