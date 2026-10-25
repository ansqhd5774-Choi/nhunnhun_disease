@echo off
setlocal EnableExtensions
if not defined TISTORY_CDP_PORT set "TISTORY_CDP_PORT=9223"

curl.exe --fail --silent "http://127.0.0.1:%TISTORY_CDP_PORT%/json/version" >nul 2>nul
if errorlevel 1 (
  echo E_TISTORY_CHROME_NOT_RUNNING
  exit /b 30
)

echo TISTORY_CHROME_READY
exit /b 0
