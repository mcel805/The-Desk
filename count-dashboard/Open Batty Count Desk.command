#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR/.."

COUNT_DESK_PYTHON="$SCRIPT_DIR/.venv/bin/python3"
if [[ ! -x "$COUNT_DESK_PYTHON" ]]; then
  python3 -m venv "$SCRIPT_DIR/.venv"
fi
if ! "$COUNT_DESK_PYTHON" -c 'import eth_account, tickstream, websocket' >/dev/null 2>&1; then
  "$COUNT_DESK_PYTHON" -m pip install -r "$SCRIPT_DIR/requirements.txt"
fi

count_desk_health() {
  curl -fsS --max-time 3 http://127.0.0.1:8770/api/health >/dev/null 2>&1
}

codex_widget_ready() {
  curl -fsS --max-time 3 http://127.0.0.1:8770/api/codex-widget/health 2>/dev/null | /usr/bin/grep -Eq '"available"[[:space:]]*:[[:space:]]*true'
}

if count_desk_health && ! codex_widget_ready; then
  listener_pid="$(lsof -nP -tiTCP:8770 -sTCP:LISTEN 2>/dev/null)"
  listener_command="$(ps -p "$listener_pid" -o command= 2>/dev/null)"
  listener_cwd="$(lsof -a -p "$listener_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [[ "$listener_pid" != <-> || "$listener_command" != *"count-dashboard/server.py"* || "$listener_cwd" != "$PWD" ]]; then
    print -u2 "Port 8770 serves an older Count Desk without Codex chat, but is not a verified process from this checkout. Stop it manually and reopen Count Desk."
    exit 1
  fi
  print "Restarting older Count Desk server to connect Codex chat…"
  kill -TERM "$listener_pid"
  for attempt in {1..40}; do
    ! count_desk_health && break
    sleep 0.1
  done
  if count_desk_health; then
    print -u2 "The older Count Desk server did not stop; port 8770 is still in use."
    exit 1
  fi
fi

if ! count_desk_health; then
  nohup "$COUNT_DESK_PYTHON" count-dashboard/server.py >count-dashboard/data/server.log 2>&1 &
  for attempt in {1..40}; do
    count_desk_health && break
    sleep 0.1
  done
fi
if ! count_desk_health; then
  print -u2 "Count Desk failed to start. See count-dashboard/data/server.log."
  exit 1
fi
if ! codex_widget_ready; then
  print -u2 "Count Desk started, but its Codex chat route is unavailable. See count-dashboard/data/server.log."
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
