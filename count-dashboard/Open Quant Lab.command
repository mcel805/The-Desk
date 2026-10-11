#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

COUNT_DESK_PYTHON="$SCRIPT_DIR/.venv/bin/python3"
if [[ ! -x "$COUNT_DESK_PYTHON" ]]; then
  print -u2 "Count Desk's Python environment is missing. Run Open Batty Count Desk.command once to set it up."
  exit 1
fi

count_desk_health() {
  curl -fsS --max-time 3 http://127.0.0.1:8770/api/health >/dev/null 2>&1
}

if ! count_desk_health; then
  mkdir -p count-dashboard/data
  nohup "$COUNT_DESK_PYTHON" count-dashboard/server.py >count-dashboard/data/server.log 2>&1 </dev/null &
  for attempt in {1..40}; do
    count_desk_health && break
    sleep 0.1
  done
fi

if ! count_desk_health; then
  print -u2 "Quant Lab failed to start. See count-dashboard/data/server.log."
  exit 1
fi

open http://127.0.0.1:8770/quant-lab.html
