import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBook,depthRows,BookStream} from '../web/dom-book.mjs';

test('normalization sorts, removes zero size and rejects crossed/invalid books',()=>{
  const b=normalizeBook({bids:[['98','2'],['99','3'],['97','0']],asks:[['102','4'],['100','1']]});
  assert.deepEqual(b.bids.map(r=>r.price),[99,98]);assert.equal(b.asks[0].price,100);
  assert.throws(()=>normalizeBook({bids:[['100','1']],asks:[['99','2']]}));
  assert.throws(()=>normalizeBook({bids:[['99','NaN']],asks:[['100','2']]}));
});
test('cumulative depth starts at best, scales both sides equally and groups without crossing',()=>{
  const b=normalizeBook({bids:[['99.9','1'],['99.8','2'],['98.1','3']],asks:[['100.1','4'],['100.2','5']]});
  const raw=depthRows(b,11);assert.deepEqual(raw.bids.map(r=>r.total),[1,3,6]);assert.deepEqual(raw.asks.map(r=>r.total),[4,9]);assert.equal(raw.maximum,9);
  const grouped=depthRows(b,11,10,.1);assert.equal(grouped.bids[0].price,99);assert.equal(grouped.bids[0].qty,3);assert.equal(grouped.asks[0].price,101);assert.equal(grouped.asks[0].qty,9);
});
function harness(){
  const sockets=[],books=[],statuses=[],trades=[];
  const stream=new BookStream({socket:url=>{const s={url,readyState:1,sent:[],send(x){this.sent.push(JSON.parse(x));},close(){this.closed=true;this.onclose?.();}};sockets.push(s);return s;},onBook:b=>books.push(b),onStatus:s=>statuses.push(s),onTrade:t=>trades.push(t),now:()=>2000});
  return {stream,sockets,books,statuses,trades};
}
test('Hyperliquid uses fast depth and real trades, ignores wrong symbols and older snapshots',()=>{
  const h=harness();try{
    h.stream.start('hyperliquid:BTC');const s=h.sockets[0];s.onopen();assert.equal(s.sent[0].subscription.fast,true);
    const msg=(coin,time)=>s.onmessage({data:JSON.stringify({channel:'l2Book',data:{coin,time,levels:[[{px:'99',sz:'2'}],[{px:'100',sz:'3'}]]}})});
    msg('ETH',1000);msg('BTC',1000);msg('BTC',999);assert.equal(h.books.length,1);
    s.onmessage({data:JSON.stringify({channel:'trades',data:[{coin:'BTC',px:'99.5',side:'B',time:1000}]})});assert.equal(h.trades[0].price,99.5);
  }finally{h.stream.stop();}
});
test('Coinbase deltas are absolute quantities, delete zero, and wait for a snapshot',()=>{
  const h=harness();try{
    h.stream.start('coinbase:BTC-USD');const s=h.sockets[0];s.onopen();assert.ok(s.sent[0].channels.includes('level2_batch'));
    const msg=m=>s.onmessage({data:JSON.stringify({product_id:'BTC-USD',...m})});
    msg({type:'l2update',time:'2026-10-11T17:00:00Z',changes:[['buy','99','3']]});assert.equal(h.books.length,0);
    msg({type:'snapshot',bids:[['99','1'],['98','2']],asks:[['100','3']]});
    msg({type:'l2update',time:'2026-10-11T17:00:00Z',changes:[['buy','99','4'],['buy','98','0']]});
    assert.deepEqual(h.books.at(-1).bids,[{price:99,qty:4}]);
    msg({type:'l2update',time:'2026-10-11T16:59:00Z',changes:[['buy','99','10']]});assert.equal(h.books.at(-1).bids[0].qty,4);
  }finally{h.stream.stop();}
});
test('market switching and disconnect invalidate old packets and clean up subscriptions',()=>{
  const h=harness();try{
    h.stream.start('hyperliquid:BTC');const old=h.sockets[0],receive=old.onmessage;h.stream.start('hyperliquid:ETH','depth');assert.ok(old.closed);
    receive({data:JSON.stringify({channel:'l2Book',data:{coin:'BTC',time:1000,levels:[[{px:'99',sz:'2'}],[{px:'100',sz:'3'}]]}})});assert.equal(h.books.length,0);
    h.sockets[1].onopen();assert.equal(h.sockets[1].sent[0].subscription.fast,false);h.sockets[1].close();assert.equal(h.statuses.at(-1),'reconnecting');
  }finally{h.stream.stop();}
});
test('Coinbase ordered price index handles insertion, deletion and replacement of the best level',()=>{
  const h=harness();try{
    h.stream.start('coinbase:ETH-USD');const s=h.sockets[0];
    const msg=m=>s.onmessage({data:JSON.stringify({product_id:'ETH-USD',...m})});
    msg({type:'snapshot',bids:[['98','1'],['97','2']],asks:[['102','3'],['103','4']]});
    msg({type:'l2update',time:'2026-10-11T17:00:01Z',changes:[['buy','99','5'],['sell','101','6']]});
    assert.deepEqual(h.books.at(-1).bids.map(r=>r.price),[99,98,97]);assert.deepEqual(h.books.at(-1).asks.map(r=>r.price),[101,102,103]);
    msg({type:'l2update',time:'2026-10-11T17:00:02Z',changes:[['buy','99','0'],['sell','101','0'],['sell','102','7']]});
    assert.equal(h.books.at(-1).bids[0].price,98);assert.deepEqual(h.books.at(-1).asks[0],{price:102,qty:7});
  }finally{h.stream.stop();}
});
