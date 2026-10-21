@echo off
rem Teomoony web server - restart (2026-10-19)
rem   ASCII only on purpose: cmd reads this file as CP949,
rem   so Korean comments get mangled into commands.
rem   Kills ONLY the process listening on 5173; other node jobs are left alone.
rem   2026-10-19: this used to kill whatever was listening on 5173. Twice in
rem   one day that killed the window the USER was running (npm run dev), once
rem   causing EADDRINUSE and once silently taking the site down. The user runs
rem   the dev server themselves; a source edit reloads it with no help from us.
rem   So: if 5173 is already serving, STOP. Pass /force to kill it on purpose.
set FORCE=0
if /i "%~1"=="/force" set FORCE=1
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  if "%FORCE%"=="0" (
    echo.
    echo   Something is ALREADY serving on 5173 - leaving it alone.
    echo   The dev server reloads on save, so a restart is usually not needed.
    echo   Really want to replace it?  restart_web.cmd /force
    echo.
    pause
    exit /b 1
  )
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo   killing old server PID %%p
    taskkill /PID %%p /F >nul 2>&1
  )
)
rem   'npm run dev' = node --watch: saving a source file reloads the
rem   server. Without it an edit looks applied but the running server
rem   still answers with the OLD code - that cost an hour on 2026-10-19.
cd /d C:\Project\Teomoony-f
echo.
echo   http://localhost:5173
echo   Close this window to stop the server.
echo.
call npm run dev
echo.
echo   server stopped.
pause
