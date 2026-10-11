const FIB_LEVELS = [0, .236, .382, .5, .618, .786, 1];

function pivotAt(bars, index, length) {
  if (index < length || index + length >= bars.length) return null;
  const point = bars[index];
  let high = Number.isFinite(Number(point.high));
  let low = Number.isFinite(Number(point.low));
  for (let i = index - length; i <= index + length; i += 1) {
    if (i === index) continue;
    if (Number(bars[i]?.high) >= Number(point.high)) high = false;
    if (Number(bars[i]?.low) <= Number(point.low)) low = false;
  }
  return {high, low};
}

export function smartOteStructure(bars, {pivotLength = 10, oteLow = .618, oteHigh = .786} = {}) {
  if (!Array.isArray(bars) || !Number.isInteger(pivotLength) || pivotLength < 1) return null;
  const pivots = new Map();
  for (let index = pivotLength; index + pivotLength < bars.length; index += 1) {
    const pivot = pivotAt(bars, index, pivotLength);
    if (!pivot) continue;
    const confirmationIndex = index + pivotLength;
    const entry = pivots.get(confirmationIndex) || [];
    if (pivot.high) entry.push({side: 'HIGH', index, confirmationIndex, price: Number(bars[index].high)});
    if (pivot.low) entry.push({side: 'LOW', index, confirmationIndex, price: Number(bars[index].low)});
    pivots.set(confirmationIndex, entry);
  }

  let lastHigh = null, lastLow = null, priorHigh = null, priorLow = null;
  let direction = 0, structure = null;
  for (let index = 0; index < bars.length; index += 1) {
    for (const pivot of pivots.get(index) || []) {
      if (pivot.side === 'HIGH') {
        priorHigh = lastHigh;
        lastHigh = pivot;
        if (priorHigh && pivot.price > priorHigh.price && direction <= 0 && lastLow) {
          direction = 1;
          structure = {direction, low: lastLow, high: pivot, updatedAtIndex: index, shiftAtIndex: index};
        } else if (direction === 1 && structure && pivot.price > structure.high.price) {
          structure.high = pivot;
          structure.updatedAtIndex = index;
        }
      } else {
        priorLow = lastLow;
        lastLow = pivot;
        if (priorLow && pivot.price < priorLow.price && direction >= 0 && lastHigh) {
          direction = -1;
          structure = {direction, low: pivot, high: lastHigh, updatedAtIndex: index, shiftAtIndex: index};
        } else if (direction === -1 && structure && pivot.price < structure.low.price) {
          structure.low = pivot;
          structure.updatedAtIndex = index;
        }
      }
    }
  }
  if (!structure || !(structure.high.price > structure.low.price)) return null;

  const range = structure.high.price - structure.low.price;
  const priceAt = level => structure.direction === 1
    ? structure.high.price - range * level
    : structure.low.price + range * level;
  const levels = [...new Set([...FIB_LEVELS, Number(oteLow), Number(oteHigh)])]
    .filter(level => Number.isFinite(level) && level >= 0 && level <= 1)
    .sort((a, b) => a - b)
    .map(level => {
      const price = priceAt(level);
      let completedAtIndex = null;
      for (let index = structure.updatedAtIndex + 1; index < bars.length; index += 1) {
        const reached = structure.direction === 1
          ? Number(bars[index].low) <= price
          : Number(bars[index].high) >= price;
        if (reached) { completedAtIndex = index; break; }
      }
      return {level, price, completed: completedAtIndex !== null, completedAtIndex};
    });
  return {...structure, levels, range, startTime: Number(bars[structure.low.index < structure.high.index ? structure.low.index : structure.high.index].time),
    confirmedAt: Number(bars[structure.shiftAtIndex].time), updatedAt: Number(bars[structure.updatedAtIndex].time),
    directionLabel: structure.direction === 1 ? 'BULLISH' : 'BEARISH'};
}

export const smartOteFibLevels = FIB_LEVELS;
