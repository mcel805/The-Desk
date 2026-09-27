"""Download a versioned public BTC-USD daily fixture; no account/auth/order endpoints."""
from datetime import datetime,timedelta,timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json,hashlib,requests
out=Path(__file__).parents[1]/'validation'
start=datetime(2019,1,1,tzinfo=timezone.utc);end=datetime(2026,9,12,tzinfo=timezone.utc)
windows=[];at=start
while at<end:
    stop=min(end,at+timedelta(days=299));windows.append((at,stop));at=stop
url='https://api.exchange.coinbase.com/products/BTC-USD/candles'
def fetch(window):
    a,b=window
    r=requests.get(url,params={'granularity':86400,'start':a.isoformat(),'end':b.isoformat()},timeout=25)
    r.raise_for_status();body=r.json()
    if not isinstance(body,list):raise RuntimeError(body)
    return {'url':r.url,'data':body}
with ThreadPoolExecutor(max_workers=3) as pool:responses=list(pool.map(fetch,windows))
unique={r[0]:r for response in responses for r in response['data'] if start.timestamp()<=r[0]<end.timestamp()}
bars=[{'time':r[0],'low':r[1],'high':r[2],'open':r[3],'close':r[4],'volume':r[5]} for r in sorted(unique.values())]
payload={'source':url,'symbol':'COINBASE:BTCUSD','interval':'1D','cutoff_exclusive':end.isoformat(),'retrieved_at':datetime.now(timezone.utc).isoformat(),'bars':bars,'request_urls':[r['url'] for r in responses]}
p=out/'BTCUSD-D-2019-2026-coinbase-v001.json';p.write_text(json.dumps(payload,indent=2))
print(json.dumps({'path':str(p),'bars':len(bars),'first':bars[0]['time'],'last':bars[-1]['time'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}))
