@echo off
echo Starting Pegasus AI Platform...

:: Kill any existing instances
wsl -d ubuntu -e bash -c "pkill -f 'static-server.cjs' 2>/dev/null; pkill -f 'vite' 2>/dev/null" >nul 2>&1

:: API server (port 4201) - opens in its own terminal window
start "Pegasus API" wsl -d ubuntu -e bash -c "cd ~/projects/claude-code/pegasus-ai-platform && npm run api; exec bash"

:: Wait for API to initialize
timeout /t 3 /nobreak >nul

:: Frontend dev server (port 5174) - opens in its own terminal window
start "Pegasus Frontend" wsl -d ubuntu -e bash -c "cd ~/projects/claude-code/pegasus-ai-platform && npm run dev; exec bash"

:: Wait for Vite to compile
timeout /t 4 /nobreak >nul

echo.
echo  Pegasus AI Platform is starting...
echo.
echo  API       http://localhost:4201
echo  Frontend  http://localhost:5174
echo.

:: Open the app in the default browser
start http://localhost:5174
