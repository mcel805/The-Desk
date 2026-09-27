#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

if ! curl -fsS http://127.0.0.1:8770/api/health >/dev/null 2>&1; then
  nohup python3 count-dashboard/server.py >count-dashboard/data/server.log 2>&1 &
  for attempt in {1..40}; do
    curl -fsS http://127.0.0.1:8770/api/health >/dev/null 2>&1 && break
    sleep 0.1
  done
fi
if ! curl -fsS http://127.0.0.1:8770/api/health >/dev/null 2>&1; then
  print -u2 "Count Desk failed to start. See count-dashboard/data/server.log."
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8041/api/health >/dev/null 2>&1; then
  nohup python3 liquidity-lab/server.py --port 8041 >liquidity-lab/data/server.log 2>&1 &
  for attempt in {1..40}; do
    curl -fsS http://127.0.0.1:8041/api/health >/dev/null 2>&1 && break
    sleep 0.1
  done
fi
if ! curl -fsS http://127.0.0.1:8041/api/health >/dev/null 2>&1; then
  print -u2 "Liquidity Lab failed to start. See liquidity-lab/data/server.log."
  exit 1
fi

open http://127.0.0.1:8770/
