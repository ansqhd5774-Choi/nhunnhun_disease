@echo off
setlocal EnableExtensions
if not defined TISTORY_CHROME_PATH set "TISTORY_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined TISTORY_PROFILE_DIR set "TISTORY_PROFILE_DIR=C:\tistory-publisher\profile"
if not defined TISTORY_CDP_PORT set "TISTORY_CDP_PORT=9223"

if not exist "%TISTORY_CHROME_PATH%" exit /b 12
if not exist "%TISTORY_PROFILE_DIR%\" mkdir "%TISTORY_PROFILE_DIR%"

curl.exe --fail --silent "http://127.0.0.1:%TISTORY_CDP_PORT%/json/version" >nul 2>nul
if not errorlevel 1 exit /b 0

start "" "%TISTORY_CHROME_PATH%" --remote-debugging-address=127.0.0.1 --remote-debugging-port=%TISTORY_CDP_PORT% --user-data-dir="%TISTORY_PROFILE_DIR%" --no-first-run --no-default-browser-check --disable-session-crashed-bubble about:blank

for /L %%I in (1,1,30) do (
  ping 127.0.0.1 -n 2 >nul
  curl.exe --fail --silent "http://127.0.0.1:%TISTORY_CDP_PORT%/json/version" >nul 2>nul
  if not errorlevel 1 exit /b 0
)
echo E_TISTORY_CDP_UNAVAILABLE
exit /b 30
