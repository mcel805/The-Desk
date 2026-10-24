import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from spider_service import (FRAMES,Spider,normalize_snapshot,validate_analysis,validate_research,public_url)
from spider_schema import ANALYSIS_SCHEMA,RESEARCH_SCHEMA
from ibkr_data import normalize_bar,CHICAGO
from datetime import datetime

NOW=1792870000000

def snapshot(tf='1m',instrument='hyperliquid:BTC'):
 ms=FRAMES[tf];end=NOW//ms*ms
 return {'instrument':instrument,'timeframe':tf,'as_of':NOW,'bars':[{'time':end-(20-i)*ms,'open':100+i,'high':103+i,'low':97+i,'close':101+i,'volume':10}for i in range(20)]}

def research():
 urls=['https://www.federalreserve.gov/newsevents.htm','https://www.cmegroup.com/markets.html','https://www.reuters.com/markets/']
 return {'headline':'SYNTHETIC TEST · no live news','sentiment':'Fixture only','calendar':'Unverified; no entry.',
 'drivers':[{'topic':t,'assessment':'Fixture evidence only','sourceUrls':[urls[i%3]]}for i,t in enumerate(('rates','bonds','equities-ai','infrastructure','futures','crypto','macro-geopolitics','calendar'))],
 'sources':[{'title':'SYNTHETIC TEST reference','url':u,'publishedAt':'unverified','supports':'Fixture schema only; not retrieved'}for u in urls], 'limitations':['SYNTHETIC TEST']}

def analysis(snapshots):
 frames=[]
 for tf,s in snapshots.items():
  available=s['status']=='available';b=s.get('bars',[None])[-3] if available else None
  frame={'timeframe':tf,'bias':'Neutral','status':'watch'if available else 'insufficient-evidence','thesis':'SYNTHETIC TEST','sequence':'No qualified trap.','nextEvent':'Wait for new evidence.','invalidation':'Reassess after fresh build.','annotations':[]}
  if b:
   for role,key in [('liquidity','high'),('objective','low')]:
    frame['annotations'].append({'id':tf+'-'+key,'kind':'level','role':role,'label':'TEST '+key,'reason':'Synthetic source candle extreme','state':'observed','time':b['time'],'endTime':s['completedCutoff'],'price':b[key],'endPrice':b[key],'evidenceTimes':[b['time']]})
   frame['annotations'].extend([
    {'id':tf+'-zone','kind':'zone','role':'block','label':'TEST candidate block','reason':'Synthetic source range; not a qualified live setup','state':'observed','time':b['time'],'endTime':s['completedCutoff'],'price':b['low'],'endPrice':b['high'],'evidenceTimes':[b['time']]},
    {'id':tf+'-path','kind':'path','role':'conditional','label':'TEST conditional path','reason':'Synthetic rendering check only','state':'conditional','time':b['time'],'endTime':s['completedCutoff']+FRAMES[tf]*3,'price':b['close'],'endPrice':b['high']+2,'evidenceTimes':[b['time']]}])
  frames.append(frame)
 return {'title':'SYNTHETIC TEST · opening report','stance':'Watch · no paper setup','summary':'Synthetic integration proof only. No live news or prices.', 'keyLevels':'Source candle references only.','primaryPlan':'Wait for a qualified block and secondary pool.','alternativePlan':'Do not enter.','risk':'No orders; synthetic test.','nextReview':'Manual refresh.','frames':frames}

class FakeCodex:
 def __init__(self,cwd,on_event):self.thread_id=None;self.on_event=on_event;self.calls=[]
 def account(self):return {'connected':True,'type':'SYNTHETIC_TEST'}
 def ensure_thread(self,instructions):self.instructions=instructions;self.thread_id='synthetic-spider-session';return self.thread_id
 def run(self,prompt,schema=None,**kw):
  self.calls.append(prompt)
  if schema==RESEARCH_SCHEMA:
   e={'type':'webSearch','action':{'type':'search','query':'SYNTHETIC TEST'}};self.on_event('search',e);return research(),[e]
  if schema==ANALYSIS_SCHEMA:
   data=json.loads(prompt.split('SNAPSHOT ',1)[1]);return analysis(data),[]
  return 'SYNTHETIC TEST response with refreshed chart evidence',[]
 def close(self):pass

class SpiderEvidenceTests(unittest.TestCase):
 def test_forming_bars_excluded_and_hash_is_reproducible(self):
  d=snapshot();d['bars'].append({'time':NOW//60000*60000,'open':100,'high':105,'low':98,'close':104,'volume':2})
  with patch('spider_service.time.time',return_value=NOW/1000):
   s=normalize_snapshot(d,d['instrument'],'1m',NOW)
   self.assertEqual(len(s['bars']),20);self.assertTrue(all(b['end_time']<=NOW for b in s['bars']))
   self.assertEqual(s['sha256'],normalize_snapshot(d,d['instrument'],'1m',NOW)['sha256'])
 def test_wrong_symbol_stale_receipt_bad_ohlc_and_old_tail_rejected(self):
  for mutate in [lambda d:d.update(instrument='coinbase:BTC-USD'),lambda d:d.update(as_of=NOW-46000),lambda d:d['bars'][0].update(high=1),lambda d:[b.update(time=b['time']-3600000)for b in d['bars']]]:
   d=snapshot();mutate(d)
   with patch('spider_service.time.time',return_value=NOW/1000),self.assertRaises(ValueError):normalize_snapshot(d,'hyperliquid:BTC','1m',NOW)
 def test_all_frames_require_local_price_and_time_anchors(self):
  with patch('spider_service.time.time',return_value=NOW/1000):ss={tf:normalize_snapshot(snapshot(tf),'hyperliquid:BTC',tf,NOW)for tf in FRAMES}
  a=analysis(ss);validate_analysis(a,ss)
  for mutate in [lambda x:x['frames'].pop(),lambda x:x['frames'][0]['annotations'][0].update(price=999999),lambda x:x['frames'][0]['annotations'][0].update(time=1),lambda x:x['frames'][0]['annotations'][0].update(evidenceTimes=[]),lambda x:x['frames'][0]['annotations'][0].update(kind='path')]:
   bad=copy.deepcopy(a);mutate(bad)
   with self.assertRaises(ValueError):validate_analysis(bad,ss)
 def test_unavailable_frame_cannot_get_markup(self):
  ss={tf:{'status':'unavailable','bars':[]}for tf in FRAMES};a=analysis(ss);validate_analysis(a,ss)
  a['frames'][0]['status']='ready-paper'
  with self.assertRaises(ValueError):validate_analysis(a,ss)
 def test_live_search_and_publisher_coverage_are_required(self):
  r=research();validate_research(r,[{'type':'webSearch'}])
  with self.assertRaises(ValueError):validate_research(r,[])
  r['sources'][0]['url']='http://localhost:18880/api/command'
  with self.assertRaises(ValueError):validate_research(r,[{}])
  self.assertFalse(public_url('https://127.0.0.1/'));self.assertFalse(public_url('https://user:password@example.com/'))
 def test_daily_futures_date_and_dst_keep_provider_trading_day(self):
  b=SimpleNamespace(date='20261102',open=100,high=110,low=90,close=105,volume=3)
  d=normalize_bar(b,'1d');self.assertEqual(d['trading_date'],'20261102')
  self.assertEqual(datetime.fromtimestamp(d['time']/1000,CHICAGO).isoformat(),'2026-11-01T17:00:00-06:00')
  self.assertEqual(datetime.fromtimestamp(d['end_time']/1000,CHICAGO).hour,16)
 def test_manual_pipeline_research_precedes_freeze_and_archive(self):
  class Gateway:
   def bars(self,instrument,tf,limit):return snapshot(tf,instrument)
  with tempfile.TemporaryDirectory()as tmp,patch('spider_service.time.time',return_value=NOW/1000):
   service=Spider(Gateway(),SimpleNamespace(instrument=lambda x:x),SimpleNamespace(instrument=None),tmp,FakeCodex)
   started=service.begin('hyperliquid:BTC','opening')
   for _ in range(200):
    if service.status()['run']['status']in('complete','failed'):break
    time.sleep(.01)
   self.assertEqual(service.current['status'],'complete',service.current['error'])
   saved=service.read(started['id']);self.assertEqual(len(saved['snapshots']),9);self.assertTrue(saved['analysis'])
   self.assertIn('FIRST use LIVE web search',service.session.calls[0]);self.assertIn('SNAPSHOT ',service.session.calls[1])
   self.assertFalse(service.status()['executionEnabled']);self.assertEqual(len(service.history()),1)
   self.assertTrue(service.session.instructions.find('no shell')>=0)
   with self.assertRaises(ValueError):service.begin('hyperliquid:BTC','scheduled')
   with self.assertRaises(ValueError):service.read('../settings')

if __name__=='__main__':unittest.main()
