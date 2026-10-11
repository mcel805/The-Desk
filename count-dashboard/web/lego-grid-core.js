// Count Desk's presentation grid. Rectangles are logical cells, independent of pixels
// or any future Blender/Unreal renderer. The caller owns chart/data state.
export const DESK_GRID = Object.freeze({columns:12, rows:8});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function preferredSpan(item, index, count, hasChart) {
  if (count === 1) return [12, 8];
  if (hasChart && item.kind === 'chart') {
    if (count <= 4) return [8, 8];
    if (count === 5) return [7, 8];
    if (count <= 7) return [6, 8];
    return [6, 8];
  }
  if (hasChart) {
    if (item.kind === 'watchlist') return [4, 8];
    if (count === 2) return [4, 8];
    if (count === 3) return [4, 4];
    if (count === 4) return [4, index === 3 ? 2 : 3];
    if (count === 5) return [5, 2];
    if (item.kind === 'agents') return [3, 6];
    return [3, 2];
  }
  if (count === 2) return [6, 8];
  if (count === 3) return [4, 8];
  if (count === 4) return [6, 4];
  return [4, count <= 6 ? 4 : 2];
}

const namedSpans = Object.freeze({
  small:[3, 2], medium:[4, 3], wide:[8, 4], full:[12, 8],
});

export function packLegoGrid(items, {mobile = false} = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (items.length === 1) return [{id:items[0].id, x:1, y:1, columns:mobile ? 1 : 12, rows:mobile ? 1 : 8}];
  if (mobile) {
    let row = 1;
    const placements = new Map();
    for (const item of [...items].sort((a, b) => Number(b.kind === 'chart') - Number(a.kind === 'chart'))) {
      const preferredRows = item.kind === 'chart' || item.kind === 'agents' ? 3 : 1;
      const rows = items.length === 1 ? 1 : clamp(Number(item.mobileRows) || preferredRows,1,8);
      const rect = {id:item.id, x:1, y:row, columns:1, rows};
      row += rows;
      placements.set(item.id,rect);
    }
    return items.map(item => placements.get(item.id));
  }

  const count = items.length;
  const hasChart = items.some(item => item.kind === 'chart');
  const occupied = new Set();
  const result = new Map();
  const key = (x, y) => `${x}:${y}`;
  const free = (x, y, columns, rows) => {
    if (x < 1 || y < 1 || x + columns - 1 > DESK_GRID.columns) return false;
    for (let cy = y; cy < y + rows; cy++)
      for (let cx = x; cx < x + columns; cx++) if (occupied.has(key(cx, cy))) return false;
    return true;
  };
  const occupy = (item, x, y, columns, rows) => {
    for (let cy = y; cy < y + rows; cy++)
      for (let cx = x; cx < x + columns; cx++) occupied.add(key(cx, cy));
    result.set(item.id, {id:item.id, x, y, columns, rows});
  };
  const spanOf = (item, index) => {
    if (count === 1) return [12, 8];
    const source = item.span || namedSpans[item.size] || preferredSpan(item, index, count, hasChart);
    const minColumns = item.kind === 'chart' ? 4 : 2;
    const minRows = item.kind === 'chart' ? 3 : 1;
    return [clamp(Number(source[0]) || minColumns, minColumns, 12),
      clamp(Number(source[1]) || minRows, minRows, 8)];
  };
  // Explicit placements reserve their cells before auto packing. A collision falls
  // back to first fit, so a saved layout stays usable as modules are added or removed.
  items.forEach((item, index) => {
    const [columns, rows] = spanOf(item, index);
    const x = Number(item.position?.x);
    const y = Number(item.position?.y);
    if (Number.isInteger(x) && Number.isInteger(y) && free(x, y, columns, rows))
      occupy(item, x, y, columns, rows);
  });
  const priority = item => item.kind === 'chart' ? 2 : item.kind === 'watchlist' ? 1 : 0;
  const packingOrder = [...items].sort((a, b) => priority(b) - priority(a));
  packingOrder.forEach((item) => {
    const index = items.indexOf(item);
    if (result.has(item.id)) return;
    const [columns, rows] = spanOf(item, index);
    for (let y = 1; y < 1000; y++) {
      let found = false;
      for (let x = 1; x <= 13 - columns; x++) {
        if (!free(x, y, columns, rows)) continue;
        occupy(item, x, y, columns, rows);
        found = true;
        break;
      }
      if (found) break;
    }
  });
  return items.map(item => result.get(item.id));
}
