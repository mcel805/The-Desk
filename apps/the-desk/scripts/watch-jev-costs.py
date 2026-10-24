#!/usr/bin/env python3
"""Meter a pre-upgrade collector without restarting it or reading its API key.

Only jev_usage is maintained; runs/predictions/ledger are never changed.
Static output contains the same public cost DTO as the native status API.
Exits automatically when the upgraded server supplies native cost accounting.
"""
import argparse
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from jev_costs import JevCostMeter


def status(url):
    parsed=urlsplit(url)
    if parsed.scheme!='http' or parsed.hostname!='127.0.0.1' or parsed.path!='/api/swing/status' or parsed.username or parsed.password:
        raise ValueError('Use the local loopback Swing status URL')
    with urlopen(url,timeout=5) as response:return json.load(response)


def publish(meter,state,output):
    meter.backfill()
    contexts={symbol:{'run':value.get('run'),'parent_id':(value.get('snapshot') or {}).get('parent_id'),
        'running':value.get('running',False),'jev_enabled':value['config']['jev_enabled'],
        'cadence_seconds':value['config']['cadence_seconds'],'key_configured':state['jev_configured']}
        for symbol,value in state['symbols'].items()}
    data=meter.summary(contexts,state['model']);data['transport']='local usage observer · no collector restart'
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    pending=output.with_suffix('.pending')
    pending.write_text(json.dumps(data,separators=(',',':'),allow_nan=False));pending.replace(output)
    return data


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--data-dir',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--status-url',default='http://127.0.0.1:18884/api/swing/status');parser.add_argument('--once',action='store_true')
    args=parser.parse_args();meter=None;announced=False
    while True:
        try:
            state=status(args.status_url)
            if 'costs' in state:
                print('Native server cost accounting is available; observer finished.',flush=True);return
            if meter is None:meter=JevCostMeter(Path(args.data_dir)/'swing-research.sqlite3')
            publish(meter,state,args.output)
            if not announced:print('Local Jev usage observer active; no additional inference requests.',flush=True);announced=True
            if args.once:return
        except (OSError,ValueError,KeyError) as error:
            if args.once:raise
            print(type(error).__name__+': cost refresh unavailable; retrying.',flush=True)
        time.sleep(3)


if __name__=='__main__':main()
