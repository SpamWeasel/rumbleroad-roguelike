import { OBJECTS, STREET_LITTER } from "./data/objects";
import { STREET_VENDORS } from "./data/shops";
import { distanceMap, Grid, wouldCut } from "./grid";
import { Rng } from "./rng";
import { isWallLike, T, walkable } from "./tiles";

export type StreetTheme = "alley" | "yard" | "docks" | "warehouse" | "construction";
export type GenKind = "streets" | "park" | "tunnel";

export interface GenResult {
  grid: Grid;
  exits: { x: number; y: number; marker: string }[];
  doors: Map<number, string>;
  objects: { x: number; y: number; id: string }[];
  /** Squares lit by lamps (seen from further away). */
  lit: Uint8Array;
}

/** Builds a random district. Always returns a level where both ends are connected. */
export function generateDistrict(seed: number, kind: GenKind, theme: StreetTheme): GenResult {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = new Rng(seed + attempt * 7919);
    const result =
      kind === "park" ? genPark(rng) : kind === "tunnel" ? genTunnel(rng) : genStreets(rng, theme);
    if (finish(result, rng)) return result;
  }
  throw new Error(`Could not build a district for seed ${seed}.`);
}

// ---------------------------------------------------------------------------------------------
// Streets: a winding main road with alleys and courtyards off it.

const PRIORITY: Record<number, number> = {
  [T.ROAD]: 3,
  [T.LANE]: 3,
  [T.SIDEWALK]: 2,
  [T.DIRT]: 2,
  [T.FLOOR]: 2,
  [T.PLANK]: 2,
  [T.RUBBLE]: 2,
};

function paint(g: Grid, x: number, y: number, tile: number): void {
  if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) return;
  const cur = g.get(x, y);
  if ((PRIORITY[tile] ?? 1) >= (PRIORITY[cur] ?? 0)) g.set(x, y, tile);
}

function genStreets(rng: Rng, theme: StreetTheme): GenResult {
  const w = rng.int(96, 118);
  const h = 30;
  const wallTile =
    theme === "docks"
      ? T.WOODWALL
      : theme === "warehouse" || theme === "construction"
        ? T.CONCRETE
        : T.WALL;
  const g = new Grid(w, h, wallTile);
  const narrow = theme === "alley";
  const pave = theme === "construction" ? T.DIRT : T.SIDEWALK;
  const waterTop = theme === "docks" ? h - 8 : h;
  const minY = 4;
  const maxY = Math.min(h - 6, waterTop - 5);

  const band = (x: number, y: number, vertical: boolean) => {
    const half = narrow ? 1 : 2;
    for (let o = -half; o <= half; o++) {
      const [px, py] = vertical ? [x + o, y] : [x, y + o];
      if (narrow) paint(g, px, py, rng.chance(0.08) ? T.RUBBLE : pave);
      else if (Math.abs(o) === 2) paint(g, px, py, pave);
      else if (o === 0 && !vertical && x % 4 < 2 && theme !== "construction")
        paint(g, px, py, T.LANE);
      else paint(g, px, py, theme === "construction" && rng.chance(0.3) ? T.DIRT : T.ROAD);
    }
  };

  // Main road, west to east, jogging up and down.
  let y = rng.int(minY + 2, maxY - 2);
  const y0 = y;
  const path: { x: number; y: number }[] = [];
  let x = 0;
  while (true) {
    const xEnd = Math.min(w - 1, x + rng.int(12, 24));
    for (let px = x; px <= xEnd; px++) {
      band(px, y, false);
      path.push({ x: px, y });
    }
    if (xEnd >= w - 1) break;
    const ny = Math.max(minY, Math.min(maxY, y + (rng.chance(0.5) ? 1 : -1) * rng.int(3, 7)));
    const jx = xEnd - (narrow ? 1 : 2);
    for (let py = Math.min(y, ny); py <= Math.max(y, ny); py++) {
      band(jx, py, true);
      path.push({ x: jx, y: py });
    }
    y = ny;
    x = jx;
  }
  const yEnd = y;

  // Docks: water along the bottom, a boardwalk, and piers.
  if (theme === "docks") {
    g.rect(0, waterTop, w - 1, h - 1, T.WATER);
    g.rect(1, waterTop - 1, w - 2, waterTop - 1, T.PLANK);
    for (let px = rng.int(6, 12); px < w - 6; px += rng.int(12, 20)) {
      const len = rng.int(3, 6);
      g.rect(px, waterTop, px + 1, Math.min(h - 2, waterTop + len), T.PLANK);
    }
    // Two or more walkways down from the road to the boardwalk.
    const links = rng.int(2, 4);
    for (let i = 0; i < links; i++) {
      const lx = Math.floor(((i + 0.5) / links) * (w - 10)) + 5 + rng.int(-3, 3);
      const startY = path.find((p) => p.x === lx)?.y ?? y0;
      for (let py = startY; py < waterTop - 1; py++) {
        paint(g, lx, py, T.PLANK);
        paint(g, lx + 1, py, T.PLANK);
      }
    }
  }

  // Side alleys ending in courtyards.
  const courtTile =
    theme === "warehouse"
      ? T.FLOOR
      : theme === "yard" || theme === "construction"
        ? T.DIRT
        : theme === "docks"
          ? T.PLANK
          : T.SIDEWALK;
  const branches = Math.floor(w / 9);
  const courts: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < branches; i++) {
    const p = rng.pick(path);
    const dir = rng.chance(0.5) ? -1 : 1;
    const len = rng.int(3, 8);
    const wide = !narrow && rng.chance(0.3);
    let by = p.y;
    for (let s = 0; s < len + 3; s++) {
      by += dir;
      if (by < 2 || by > waterTop - 3) break;
      paint(g, p.x, by, courtTile === T.FLOOR ? T.SIDEWALK : pave);
      if (wide) paint(g, p.x + 1, by, pave);
    }
    by = Math.max(2, Math.min(waterTop - 3, by));
    const cw = theme === "warehouse" ? rng.int(8, 14) : rng.int(5, 11);
    const ch = theme === "warehouse" ? rng.int(4, 6) : rng.int(3, 5);
    const cx0 = Math.max(1, Math.min(w - cw - 2, p.x - rng.int(1, cw - 1)));
    const cy0 = dir < 0 ? Math.max(1, by - ch + 1) : by;
    const cy1 = Math.min(waterTop - 2, cy0 + ch - 1);
    if (cy1 <= cy0) continue;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx < cx0 + cw; cx++) paint(g, cx, cy, courtTile);
    courts.push({ x0: cx0, y0: cy0, x1: cx0 + cw - 1, y1: cy1 });
  }

  // Theme props inside courtyards.
  for (const c of courts) {
    const area = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1);
    const props = Math.floor(area / 10);
    for (let i = 0; i < props; i++) {
      const px = rng.int(c.x0, c.x1);
      const py = rng.int(c.y0, c.y1);
      if (!g.walk(px, py) || wouldCut(g, px, py)) continue;
      const prop =
        theme === "warehouse"
          ? rng.pick([T.CRATES, T.CRATES, T.PILLAR])
          : theme === "construction"
            ? rng.pick([T.PIT, T.GIRDER, T.CRATES])
            : theme === "yard"
              ? rng.pick([T.CAR, T.CRATES, T.FENCE])
              : rng.pick([T.DUMPSTER, T.DUMPSTER, T.CRATES]);
      g.set(px, py, prop);
    }
  }

  // Street furniture: lamps on sidewalks, parked cars at the curb.
  for (let px = 3; px < w - 3; px += rng.int(6, 11)) {
    for (let py = 1; py < h - 1; py++) {
      if (g.get(px, py) !== pave || narrow) continue;
      const nextToWall = isWallLike(g.get(px, py - 1)) || isWallLike(g.get(px, py + 1));
      if (nextToWall && rng.chance(0.5) && !wouldCut(g, px, py)) g.set(px, py, T.LAMP);
    }
  }
  if (!narrow && theme !== "construction") {
    for (let i = 0; i < Math.floor(w / 14); i++) {
      const p = rng.pick(path);
      const cy = p.y + (rng.chance(0.5) ? -1 : 1);
      if (g.get(p.x, cy) === T.ROAD && !wouldCut(g, p.x, cy)) g.set(p.x, cy, T.CAR);
    }
  }
  if (theme === "construction") {
    for (let i = 0; i < Math.floor(w / 8); i++) {
      const p = rng.pick(path);
      const py = p.y + rng.int(-2, 2);
      if (g.walk(p.x, py) && !wouldCut(g, p.x, py)) g.set(p.x, py, rng.pick([T.FENCE, T.GIRDER]));
    }
  }

  const exits = edgeExits(g, y0, yEnd);
  return { grid: g, exits, doors: new Map(), objects: [], lit: new Uint8Array(w * h) };
}

/** Turns the walkable squares at both ends into exits: "<" west and ">" east. */
function edgeExits(g: Grid, yWest: number, yEast: number): GenResult["exits"] {
  const exits: GenResult["exits"] = [];
  for (const [x, inner, yc, marker] of [
    [0, 1, yWest, "<"],
    [g.w - 1, g.w - 2, yEast, ">"],
  ] as const) {
    for (let y = yc - 2; y <= yc + 2; y++) {
      if (y < 1 || y >= g.h - 1) continue;
      if (g.walk(inner, y) || g.walk(x, y)) {
        g.set(inner, y, g.walk(inner, y) ? g.get(inner, y) : T.SIDEWALK);
        g.set(x, y, T.EXIT);
        exits.push({ x, y, marker });
      }
    }
  }
  return exits;
}

// ---------------------------------------------------------------------------------------------
// Park: grass, clumps of trees, ponds with bridges and a winding path.

function genPark(rng: Rng): GenResult {
  const w = rng.int(96, 116);
  const h = 30;
  const g = new Grid(w, h, T.GRASS);
  // Trees by cellular automaton: random seeding, then smoothing into clumps.
  let trees = new Uint8Array(w * h).map(() => (rng.chance(0.43) ? 1 : 0));
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || trees[ny * w + nx]) n++;
          }
        next[y * w + x] = n >= 5 ? 1 : 0;
      }
    trees = next;
  }
  for (let i = 0; i < w * h; i++) if (trees[i]) g.t[i] = T.TREE;
  // Ponds.
  const ponds = rng.int(1, 3);
  for (let i = 0; i < ponds; i++) {
    const cx = rng.int(15, w - 15);
    const cy = rng.int(8, h - 8);
    const rx = rng.int(4, 9);
    const ry = rng.int(2, 4);
    for (let y = cy - ry - 1; y <= cy + ry + 1; y++)
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1 + rng.next() * 0.3) g.set(x, y, T.WATER);
        else if (d < 1.6 && g.get(x, y) === T.TREE) g.set(x, y, T.SAND);
      }
  }
  // Main path, with bridges over water.
  const pathTile = (x: number, y: number) => {
    if (x < 0 || y < 1 || x >= w || y >= h - 1) return;
    g.set(x, y, g.get(x, y) === T.WATER || g.get(x, y) === T.PLANK ? T.PLANK : T.SIDEWALK);
  };
  let y = rng.int(8, h - 9);
  const y0 = y;
  const path: { x: number; y: number }[] = [];
  for (let x = 0; x < w; x++) {
    if (x > 2 && x < w - 3 && rng.chance(0.25))
      y = Math.max(4, Math.min(h - 6, y + (rng.chance(0.5) ? 1 : -1)));
    pathTile(x, y);
    pathTile(x, y + 1);
    path.push({ x, y });
    // Keep a little room around the path.
    for (const yy of [y - 1, y + 2])
      if (g.get(x, yy) === T.TREE && rng.chance(0.7)) g.set(x, yy, T.GRASS);
  }
  const yEnd = y;
  // Side paths.
  for (let i = 0; i < rng.int(4, 7); i++) {
    const p = rng.pick(path);
    let px = p.x;
    let py = p.y;
    const dir = rng.chance(0.5) ? -1 : 1;
    const len = rng.int(5, 14);
    for (let s = 0; s < len; s++) {
      py += dir;
      if (rng.chance(0.3)) px += rng.chance(0.5) ? 1 : -1;
      if (py < 2 || py > h - 3 || px < 2 || px > w - 3) break;
      pathTile(px, py);
    }
    // A small clearing at the end with a bench.
    for (let cy = py - 2; cy <= py + 2; cy++)
      for (let cx = px - 3; cx <= px + 3; cx++)
        if (g.get(cx, cy) === T.TREE && cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1)
          g.set(cx, cy, T.GRASS);
  }
  // A fountain plaza.
  const plaza = rng.pick(path.slice(20, -20));
  for (let cy = plaza.y - 3; cy <= plaza.y + 4; cy++)
    for (let cx = plaza.x - 6; cx <= plaza.x + 6; cx++)
      if (cy > 0 && cy < h - 1) g.set(cx, cy, T.SIDEWALK);
  g.rect(plaza.x - 1, plaza.y, plaza.x + 1, plaza.y + 1, T.FOUNTAIN);
  // Benches, lamps and hedges along the path.
  for (const p of path) {
    if (p.x % 7 !== 0) continue;
    for (const by of [p.y - 1, p.y + 2]) {
      if (g.get(p.x, by) === T.GRASS && rng.chance(0.4) && !wouldCut(g, p.x, by))
        g.set(p.x, by, rng.chance(0.5) ? T.BENCH : T.LAMP);
    }
  }
  for (let i = 0; i < w / 3; i++) {
    const x = rng.int(1, w - 2);
    const yy = rng.int(1, h - 2);
    if (g.get(x, yy) === T.GRASS && !wouldCut(g, x, yy)) g.set(x, yy, T.BUSH);
  }
  // Border of trees.
  for (let x = 0; x < w; x++) {
    g.set(x, 0, T.TREE);
    g.set(x, h - 1, T.TREE);
  }
  for (let yy = 0; yy < h; yy++) {
    g.set(0, yy, T.TREE);
    g.set(w - 1, yy, T.TREE);
  }
  const exits = edgeExits(g, y0, yEnd);
  return { grid: g, exits, doors: new Map(), objects: [], lit: new Uint8Array(w * h) };
}

// ---------------------------------------------------------------------------------------------
// Subway: a long track tunnel with platforms and maintenance rooms.

function genTunnel(rng: Rng): GenResult {
  const w = rng.int(98, 116);
  const h = 30;
  const g = new Grid(w, h, T.CONCRETE);
  const ty = Math.floor(h / 2) - 1;
  g.rect(0, ty, w - 1, ty + 1, T.RAIL);
  const platforms: { x0: number; x1: number; top: boolean }[] = [];
  for (let x = rng.int(3, 8); x < w - 12; x += rng.int(20, 30)) {
    const len = rng.int(12, 20);
    const x1 = Math.min(w - 3, x + len);
    for (const top of [true, false]) {
      if (!rng.chance(0.8)) continue;
      const y0 = top ? ty - 3 : ty + 2;
      g.rect(x, y0, x1, y0 + 2, T.PLATFORM);
      for (let px = x + 2; px < x1 - 1; px += 4) g.set(px, top ? y0 + 1 : y0 + 1, T.PILLAR);
      platforms.push({ x0: x, x1, top });
    }
  }
  // Maintenance rooms joined to the track or a platform by corridors.
  const rooms = rng.int(7, 11);
  for (let i = 0; i < rooms; i++) {
    const top = rng.chance(0.5);
    const rw = rng.int(5, 11);
    const rh = rng.int(3, 5);
    const rx = rng.int(2, w - rw - 3);
    const ry = top ? rng.int(1, ty - rh - 5) : rng.int(ty + 6, h - rh - 2);
    if (ry < 1) continue;
    g.rect(rx, ry, rx + rw - 1, ry + rh - 1, T.FLOOR);
    const cx = rng.int(rx, rx + rw - 1);
    const from = top ? ry + rh : ry - 1;
    const to = top ? ty - 1 : ty + 2;
    for (let y = Math.min(from, to); y <= Math.max(from, to); y++)
      if (g.get(cx, y) === T.CONCRETE || g.get(cx, y) === T.PILLAR) g.set(cx, y, T.FLOOR);
    // Sometimes a side passage links neighbouring rooms.
    if (rng.chance(0.5)) {
      const len = rng.int(6, 14);
      const yy = ry + Math.floor(rh / 2);
      const dir = rng.chance(0.5) ? -1 : 1;
      const sx = dir > 0 ? rx + rw : rx - 1;
      for (let s = 0; s < len; s++) {
        const xx = sx + s * dir;
        if (xx < 1 || xx > w - 2) break;
        if (g.get(xx, yy) === T.CONCRETE) g.set(xx, yy, T.FLOOR);
      }
    }
  }
  // Rubble and lamps.
  for (let i = 0; i < w / 4; i++) {
    const x = rng.int(1, w - 2);
    const y = rng.int(1, h - 2);
    if (g.get(x, y) === T.FLOOR) g.set(x, y, T.RUBBLE);
  }
  for (const p of platforms) {
    const ly = p.top ? ty - 4 : ty + 5;
    for (let x = p.x0 + 1; x < p.x1; x += 6) if (g.get(x, ly) === T.CONCRETE) g.set(x, ly, T.LAMP);
  }
  const exits = edgeExits(g, ty, ty);
  return { grid: g, exits, doors: new Map(), objects: [], lit: new Uint8Array(w * h) };
}

// ---------------------------------------------------------------------------------------------

/** Adds vendors, litter and light, removes unreachable pockets, and checks both ends connect. */
function finish(r: GenResult, rng: Rng): boolean {
  const g = r.grid;
  const west = r.exits.filter((e) => e.marker === "<");
  const east = r.exits.filter((e) => e.marker === ">");
  if (west.length === 0 || east.length === 0) return false;
  const walk = (x: number, y: number) => g.walk(x, y);
  const dist = distanceMap(g.w, g.h, walk, west);
  if (!east.some((e) => dist[e.y * g.w + e.x] >= 0)) return false;
  // Fill pockets nobody can reach.
  for (let i = 0; i < g.t.length; i++) {
    if (walkable(g.t[i]) && dist[i] < 0) g.t[i] = g.t[i] === T.PLANK ? T.WATER : T.CONCRETE;
  }
  // Street vendors set into walls next to reachable squares.
  const spots: number[] = [];
  for (let y = 2; y < g.h - 2; y++)
    for (let x = 6; x < g.w - 6; x++) {
      if (!isWallLike(g.get(x, y))) continue;
      const open = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].filter(([dx, dy]) => dist[(y + dy) * g.w + x + dx] >= 0).length;
      if (open === 1) spots.push(y * g.w + x);
    }
  const vendors = rng.weighted([
    [0, 2],
    [1, 5],
    [2, 3],
  ] as const);
  for (let i = 0; i < vendors && spots.length > 0; i++) {
    const spot = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    g.t[spot] = T.DOOR;
    r.doors.set(spot, rng.pick(STREET_VENDORS));
  }
  // Litter to pick up and throw.
  const floor: number[] = [];
  for (let i = 0; i < g.t.length; i++)
    if (walkable(g.t[i]) && g.t[i] !== T.EXIT && g.t[i] !== T.DOOR) floor.push(i);
  const litter = Math.floor(g.w / 5);
  for (let i = 0; i < litter; i++) {
    const at = rng.pick(floor);
    const id = rng.pick(STREET_LITTER);
    if (OBJECTS[id]) r.objects.push({ x: at % g.w, y: Math.floor(at / g.w), id });
  }
  // Lamps light the squares around them.
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== T.LAMP) continue;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++)
          if (dx * dx + dy * dy <= 18 && g.inb(x + dx, y + dy)) r.lit[(y + dy) * g.w + x + dx] = 1;
    }
  return true;
}
