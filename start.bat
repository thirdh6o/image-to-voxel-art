@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Voxel Workbench] Node.js ^(18+^) 未安装或未加入 PATH。
  echo 请先安装 Node.js，然后重新双击 start.bat。
  pause
  exit /b 1
)

set "APP_URL=http://127.0.0.1:4173/"

start "Voxel Workbench Server" cmd /k "cd /d "%~dp0" && node server.mjs"
powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'"

endlocal
