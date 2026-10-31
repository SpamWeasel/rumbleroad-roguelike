import { T, walkable } from "./tiles";
import { DIRS8 } from "./types";

/** A tile map being built. */
export class Grid {
  t: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
    fill: number = T.WALL,
  ) {
    this.t = new Uint8Array(w * h).fill(fill);
  }

  inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inb(x, y) ? this.t[y * this.w + x] : T.VOID;
  }

  set(x: number, y: number, tile: number): void {
    if (this.inb(x, y)) this.t[y * this.w + x] = tile;
  }

  rect(x0: number, y0: number, x1: number, y1: number, tile: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, tile);
  }

  walk(x: number, y: number): boolean {
    return walkable(this.get(x, y));
  }
}

/**
 * Can a fighter step diagonally from (x,y) by (dx,dy)? Diagonal steps may not squeeze between
 * two blocked squares.
 */
export function canStep(
  walk: (x: number, y: number) => boolean,
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  if (!walk(x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0 && !walk(x + dx, y) && !walk(x, y + dy)) return false;
  return true;
}

/** Breadth-first distances over walkable squares from the given start squares (-1 = unreachable). */
export function distanceMap(
  w: number,
  h: number,
  walk: (x: number, y: number) => boolean,
  starts: { x: number; y: number }[],
  limit = Number.POSITIVE_INFINITY,
): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (const s of starts) {
    dist[s.y * w + s.x] = 0;
    queue.push(s.y * w + s.x);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    const d = dist[i];
    if (d >= limit) continue;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1 || !canStep(walk, x, y, dx, dy)) continue;
      dist[ni] = d + 1;
      queue.push(ni);
    }
  }
  return dist;
}

/**
 * Would blocking (x,y) split its walkable neighbors into separate groups? Used before placing
 * cars, lamps and other props so they never cut a path in two.
 */
export function wouldCut(grid: Grid, x: number, y: number): boolean {
  const ring = DIRS8.map(([dx, dy]) => grid.walk(x + dx, y + dy));
  // Orthogonal neighbors are the ones paths actually use; diagonals bridge them.
  let groups = 0;
  for (let i = 0; i < 8; i++) {
    if (ring[i] && !ring[(i + 7) % 8]) groups++;
  }
  if (groups === 0 && ring.every(Boolean)) groups = 1;
  return groups > 1;
}
