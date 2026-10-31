/**
 * Recursive shadowcasting. Marks every square visible from (ox, oy) within `radius` in `out`.
 * `opaque(x, y)` says whether a square blocks sight.
 */
export function computeFov(
  w: number,
  h: number,
  ox: number,
  oy: number,
  radius: number,
  opaque: (x: number, y: number) => boolean,
  out: Uint8Array,
): void {
  out.fill(0);
  out[oy * w + ox] = 1;
  const mult = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
  ];
  const r2 = radius * radius;
  const cast = (
    row: number,
    start: number,
    end: number,
    xx: number,
    xy: number,
    yx: number,
    yy: number,
  ): void => {
    if (start < end) return;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;
      while (dx <= 0) {
        dx++;
        const x = ox + dx * xx + dy * xy;
        const y = oy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const inside = x >= 0 && y >= 0 && x < w && y < h;
        if (inside && dx * dx + dy * dy <= r2) out[y * w + x] = 1;
        const wall = !inside || opaque(x, y);
        if (blocked) {
          if (wall) {
            newStart = rSlope;
          } else {
            blocked = false;
            start = newStart;
          }
        } else if (wall && j < radius) {
          blocked = true;
          cast(j + 1, start, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  };
  for (let oct = 0; oct < 8; oct++) {
    cast(1, 1.0, 0.0, mult[0][oct], mult[1][oct], mult[2][oct], mult[3][oct]);
  }
}

/** Is there a clear straight line between two squares (for throwing)? */
export function lineOfFire(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  blocked: (x: number, y: number) => boolean,
): boolean {
  for (const [x, y] of bresenham(x0, y0, x1, y1).slice(1, -1)) if (blocked(x, y)) return false;
  return true;
}

export function bresenham(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}
