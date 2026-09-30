// Render the server's confirmed Bias and Structure Zones reports on Vela.
// Times in reports are seconds; Vela drawing anchors are milliseconds.
const ms = seconds => Number(seconds) * 1000;
const finite = value => Number.isFinite(Number(value));
const beforeEnd = (time, end) => finite(time) && Number(time) <= Number(end);

function line(add, owner, start, end, price, color, style = 'solid', width = 1) {
  if (!finite(price) || !finite(start) || !finite(end) || Number(end) <= Number(start)) return;
  add('trendline', {paneId:'price',anchors:[{time:ms(start),price:Number(price)},{time:ms(end),price:Number(price)}],
    style:{lineColor:color,lineWidth:width,lineStyle:style}}, owner);
}

function label(add, owner, time, price, value, color, align = 'top') {
  if (!finite(price) || !finite(time)) return;
  add('text', {paneId:'price',anchors:[{time:ms(time),price:Number(price)}],
    text:{value,color,size:'tiny',hAlign:'center',vAlign:align},
    style:{lineColor:'transparent',lineWidth:0,lineStyle:'solid'}}, owner);
}

export function renderBiasOverlay(report, settings, add, endTime) {
  const owner = 'bias';
  const cutoff = Math.min(Number(endTime), Number(report.confirmedCutoff));
  const point = report.points?.at(-1);
  if (report.status !== 'ready' || !point) return 0;
  let count = 0;
  const high = point.lastSwingHigh, low = point.lastSwingLow;
  for (const swing of [high, low]) {
    if (!swing || !beforeEnd(swing.confirmedTime, cutoff)) continue;
    line(add, owner, swing.confirmedTime, cutoff, swing.price,
      swing.side === 'HIGH' ? '#f23645' : '#089981', 'dashed');
    count++;
  }
  if (settings.showSwingLabels) {
    for (const swing of (report.swings || []).filter(item => beforeEnd(item.confirmedTime, cutoff)).slice(-12)) {
      label(add, owner, swing.confirmedTime, swing.price,
        swing.side === 'HIGH' ? 'H confirmed' : 'L confirmed',
        swing.side === 'HIGH' ? '#f23645' : '#089981', swing.side === 'HIGH' ? 'bottom' : 'top');
      count++;
    }
  }
  if (settings.showBreaks) {
    for (const event of (report.events || []).filter(item => beforeEnd(item.time, cutoff)).slice(-12)) {
      label(add, owner, event.time, event.price, `${event.kind} ${event.direction === 'BULLISH' ? '↑' : '↓'}`,
        event.direction === 'BULLISH' ? '#71c9b3' : '#e98283');
      count++;
    }
  }
  const direction = (settings.priorPeriod ? report.overallBias : point.bias) || 'MIXED';
  const color = direction === 'BULLISH' ? '#71c9b3' : direction === 'BEARISH' ? '#e98283' : '#b8c3cb';
  label(add, owner, cutoff, point.close, `${direction} BIAS · ${report.timeframe}`, color);
  count++;
  return count;
}

export function renderStructureZonesOverlay(report, settings, add, endTime) {
  const owner = 'structure-zones';
  const cutoff = Math.min(Number(endTime), Number(report.confirmedCutoff));
  if (report.status !== 'ready') return 0;
  let count = 0;
  for (const zone of (report.zones || []).filter(item => beforeEnd(item.createdTime, cutoff)).slice(-24)) {
    const end = ['INVALIDATED', 'EXPIRED'].includes(zone.state) ? Math.min(cutoff, Number(zone.stateTime)) : cutoff;
    if (!finite(zone.top) || !finite(zone.bottom) || end <= zone.createdTime) continue;
    const demand = zone.side === 'DEMAND';
    add('box', {paneId:'price',anchors:[
      {time:ms(zone.createdTime),price:Number(zone.top)},
      {time:ms(end),price:Number(zone.bottom)}],
      style:{lineColor:demand ? '#71c9b3' : '#e98283',lineWidth:1,lineStyle:'solid',
        fillColor:demand ? '#08998130' : '#f2364530'}}, owner);
    count++;
  }
  for (const pool of (report.pools || []).filter(item => beforeEnd(item.createdTime, cutoff)).slice(-16)) {
    const end = ['RECLAIMED', 'ACCEPTED', 'EXPIRED'].includes(pool.state)
      ? Math.min(cutoff, Number(pool.stateTime)) : cutoff;
    line(add, owner, pool.createdTime, end, pool.price, '#88a4d8', 'dashed');
    count++;
  }
  if (settings.showBreaks) {
    for (const event of (report.events || []).filter(item => beforeEnd(item.time, cutoff)).slice(-14)) {
      label(add, owner, event.time, event.price, `${event.kind} ${event.direction === 'BULLISH' ? '↑' : '↓'}`,
        event.direction === 'BULLISH' ? '#71c9b3' : '#e98283');
      count++;
    }
  }
  return count;
}
