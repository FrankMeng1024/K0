@echo off
REM Keep-alive: opens Notepad++ with tmp.txt every 9 minutes, writes timestamp, closes
REM Usage: Double-click this file to start. Keep terminal window open.
echo Keep-alive started. Press Ctrl+C to stop.
echo Will touch %TEMP%\k0_keepalive.txt every 9 minutes.

:loop
echo %date% %time% > "%TEMP%\k0_keepalive.txt"
REM Open Notepad++ if available, otherwise notepad
where notepad++ >nul 2>&1
if %errorlevel%==0 (
    start "" "notepad++" "%TEMP%\k0_keepalive.txt"
    timeout /t 3 /nobreak >nul
    taskkill /f /im notepad++.exe >nul 2>&1
) else (
    start "" notepad "%TEMP%\k0_keepalive.txt"
    timeout /t 3 /nobreak >nul
    taskkill /f /im notepad.exe >nul 2>&1
)
timeout /t 540 /nobreak >nul
goto loop
