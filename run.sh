#!/usr/bin/env bash
# Lance backend (port 8001) + frontend (port 5173) en une commande : bash run.sh
set -e
cd "$(dirname "$0")"
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f vite 2>/dev/null || true

echo "▶ Backend : installation des dépendances"
cd backend
if python3 -m venv .venv 2>/dev/null; then
  . .venv/bin/activate && pip install -q -r requirements.txt && PY="python"
else
  pip install -q -r requirements.txt --break-system-packages && PY="python3"
fi
cd ..

echo "▶ Frontend : installation des dépendances"
(cd frontend && rm -f package-lock.json && rm -rf node_modules/.vite && { [ -d node_modules/remark-gfm ] || npm install --no-audit --no-fund; })

trap 'kill 0' EXIT INT TERM
(cd backend && { [ -f .venv/bin/activate ] && . .venv/bin/activate; $PY -m uvicorn main:app --reload --port 8001; }) &
sleep 3
curl -sf localhost:8001/health >/dev/null && echo "✔ Backend OK : $(curl -s localhost:8001/health)" || echo "✘ Backend KO : voir l'erreur ci-dessus"
(cd frontend && npm run dev -- --port 5173 --strictPort) &
wait
