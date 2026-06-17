#!/usr/bin/env bash
set -euo pipefail
cd /home/sgadire1/projects/claude-code/pegasus-ai-platform
API_PORT="${API_PORT:-4201}"
UI_PORT="${UI_PORT:-5174}"
# Bind to 0.0.0.0 so the Windows browser can reach WSL servers
HOST="${HOST:-0.0.0.0}"

pkill -f "node scripts/static-server.cjs" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

setsid env HOST="${HOST}" PORT="${API_PORT}" node scripts/static-server.cjs > "/tmp/pegasus-api-${API_PORT}.out" 2> "/tmp/pegasus-api-${API_PORT}.err" < /dev/null &
setsid npm run dev -- --host "${HOST}" --port "${UI_PORT}" > "/tmp/pegasus-vite-${UI_PORT}.out" 2> "/tmp/pegasus-vite-${UI_PORT}.err" < /dev/null &

sleep 3
printf 'API  http://localhost:%s\n' "${API_PORT}"
printf 'UI   http://localhost:%s\n' "${UI_PORT}"
printf '\nLogs: /tmp/pegasus-api-%s.err and /tmp/pegasus-vite-%s.err\n' "${API_PORT}" "${UI_PORT}"
