import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestRiderConfluenceZones} from './crypto-rider-levels.mjs';

const zone=(id,side,lo,hi,strength)=>({id,side,lo,hi,strength});

test('Rider selects the nearest available confluence zone on each side of price',()=>{
  const chosen=nearestRiderConfluenceZones([
    zone('far-above',1,300,310,99), zone('near-above',1,105,110,60),
    zone('far-below',-1,40,50,99), zone('near-below',-1,90,95,55),
    zone('irrelevant',0,99,101,100)
  ],100);
  assert.deepEqual(chosen.map(x=>x.id),['near-above','near-below']);
});

test('confluence strength breaks equal-distance ties and missing sides stay empty',()=>{
  const chosen=nearestRiderConfluenceZones([
    zone('weaker',1,105,110,60), zone('stronger',1,105,110,80)
  ],100);
  assert.deepEqual(chosen.map(x=>x.id),['stronger']);
  assert.deepEqual(nearestRiderConfluenceZones([],100),[]);
  assert.deepEqual(nearestRiderConfluenceZones([zone('x',1,1,2,1)],NaN),[]);
});
