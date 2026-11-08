@echo off
rem Teomoony web server - restart
rem   ASCII only on purpose: cmd reads this file as CP949.
rem   2026-11-08: the web server now runs in Docker (container teomoony-web,
rem   service "web" in C:\Project\Teomoony\deploy\docker-compose.yml).
rem   Do NOT start "npm run dev" here any more - it would fight the container
rem   for port 5173. This file just restarts the container.
rem   Start it the first time (or after removing it):
rem     cd /d C:\Project\Teomoony
rem     docker compose --env-file .env -f deploy\docker-compose.yml up -d --no-deps web
docker restart teomoony-web
docker ps --filter name=teomoony-web
echo.
echo   http://localhost:5173  (logs: docker logs -f teomoony-web)
echo.
pause
