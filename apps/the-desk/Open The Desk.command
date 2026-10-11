#!/bin/zsh
set -e
cd "${0:A:h}"
python3 launch.py --detach
open http://127.0.0.1:18880
