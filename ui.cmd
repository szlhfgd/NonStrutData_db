@echo off
setlocal
set "ROOT=%~dp0"
set "BACKEND_EXE=%ROOT%.venv\Scripts\lightrag-server.exe"
set "FRONTEND_DIR=%ROOT%lightrag_webui"

if /i "%1"=="start"   goto :start
if /i "%1"=="stop"    goto :stop
if /i "%1"=="restart" goto :restart
echo Usage: ui.cmd start ^| stop ^| restart
goto :eof

:stop
echo Stopping UI (5173) and backend (9621)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173,9621 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo Done.
goto :eof

:restart
call :stop
timeout /t 2 /nobreak >nul
goto :start

:start
echo Starting backend (9621)...
start "LightRAG Backend" cmd /k "set PYTHONIOENCODING=utf-8 && set LIGHTRAG_PARSER=*:native-teP,*:legacy-R && cd /d %ROOT% && %BACKEND_EXE%"
echo Starting UI (5173)...
start "LightRAG UI" cmd /k "cd /d %FRONTEND_DIR% && npx vite --host"
echo.
echo Both started. Backend: http://localhost:9621   UI: http://localhost:5173
echo Close them with: ui.cmd stop
goto :eof