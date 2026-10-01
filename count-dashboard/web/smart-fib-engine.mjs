export function confirmedAlternatingSwings(bars, length = 2) {
  if (!Array.isArray(bars) || !Number.isInteger(length) || length < 1) return [];
  const pivots = [];
  for (let index = length; index < bars.length - length; index += 1) {
    const point = bars[index];
    let high = Number.isFinite(Number(point.high));
    let low = Number.isFinite(Number(point.low));
    for (let offset = index - length; offset <= index + length; offset += 1) {
      if (offset === index) continue;
      if (Number(bars[offset]?.high) >= Number(point.high)) high = false;
      if (Number(bars[offset]?.low) <= Number(point.low)) low = false;
    }
    if (high) pivots.push({index,time:Number(point.time),price:Number(point.high),side:'HIGH'});
    if (low) pivots.push({index,time:Number(point.time),price:Number(point.low),side:'LOW'});
  }
  pivots.sort((a,b)=>a.index-b.index);
  const swings=[];
  for (const pivot of pivots) {
    const previous=swings.at(-1);
    if (!previous || previous.side !== pivot.side) swings.push(pivot);
    else if ((pivot.side === 'HIGH' && pivot.price > previous.price) ||
             (pivot.side === 'LOW' && pivot.price < previous.price)) swings[swings.length-1]=pivot;
  }
  return swings;
}

export function smartFibSwingAtTime(swings, time) {
  if (!Array.isArray(swings) || !Number.isFinite(Number(time))) return null;
  const hoveredTime=Number(time);
  for (let index=1; index<swings.length; index+=1) {
    const from=swings[index-1], to=swings[index];
    if (hoveredTime >= from.time && hoveredTime <= to.time) {
      return {from,to,fromIndex:from.index,toIndex:to.index,fromTime:from.time,toTime:to.time,confirmedEndTime:to.time};
    }
  }
  return null;
}

export function advanceSmartFibSwing(current, bar) {
  if (!current?.from || !current?.to || !bar) return null;
  const barTime = Number(bar.time);
  const confirmedEndTime = Number(current.confirmedEndTime ?? current.to.time);
  const high = Number(bar.high);
  const low = Number(bar.low);
  const endPrice = Number(current.to.price);
  if (![barTime, confirmedEndTime, high, low, endPrice].every(Number.isFinite) || barTime < confirmedEndTime) return current;

  const rising = current.from.side === 'LOW' && current.to.side === 'HIGH';
  const falling = current.from.side === 'HIGH' && current.to.side === 'LOW';
  if (!rising && !falling) return current;
  const nextPrice = rising ? Math.max(endPrice, high) : Math.min(endPrice, low);
  if (nextPrice === endPrice && barTime === Number(current.to.time)) return current;
  return {
    ...current,
    to: {...current.to, time:barTime, price:nextPrice},
    confirmedEndTime:Number.isFinite(confirmedEndTime) ? confirmedEndTime : current.to.time,
  };
}
