#!/bin/zsh
set -eu
desk_directory="${0:A:h}"
cd "$desk_directory/.."
"$desk_directory/.venv/bin/python3" - <<'PY'
from pathlib import Path
from urllib.request import urlopen
import subprocess,time
try:
    urlopen('http://127.0.0.1:8770/api/health',timeout=2).close()
except OSError:
    log=Path('count-dashboard/data/server.log').open('ab')
    subprocess.Popen(['count-dashboard/.venv/bin/python3','count-dashboard/server.py'],stdout=log,stderr=log,start_new_session=True)
    for _ in range(40):
        try:
            urlopen('http://127.0.0.1:8770/api/health',timeout=1).close();break
        except OSError:time.sleep(.25)
PY
open 'http://127.0.0.1:8770/crypto-day.html'
