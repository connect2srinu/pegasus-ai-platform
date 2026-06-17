@echo off
echo Starting Pegasus AI Platform...

:: API server (port 4201)
start "Pegasus API" wsl -d ubuntu -e bash -c "cd ~/projects/claude-code/pegasus-ai-platform && npm run api; exec bash"

:: Wait a moment for the API to initialize before launching the frontend
timeout /t 2 /nobreak >nul

:: Frontend dev server (port 5174)
start "Pegasus Frontend" wsl -d ubuntu -e bash -c "cd ~/projects/claude-code/pegasus-ai-platform && npm run dev; exec bash"

echo.
echo  API:      http://127.0.0.1:4201
echo  Frontend: http://127.0.0.1:5174
echo.
