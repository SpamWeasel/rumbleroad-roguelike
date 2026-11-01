import type { Color } from "./colors";
import { ARENA_MAP } from "./data/arena";
import { BOSSES, GANGS, NICKNAMES, RANKS, type Rank } from "./data/enemies";
import { HARBOR, LIGHTHOUSE, LOBBY, MAPLE, NEON, PIER9, ROOF, TRAINYARD } from "./data/maps";
import { OBJECT_BY_LETTER } from "./data/objects";
import { type GenKind, generateDistrict, type StreetTheme } from "./generate";
import { distanceMap } from "./grid";
import { hashSeed, Rng } from "./rng";
import { T, walkable } from "./tiles";
import type { Area, Enemy, Exit, GroundItem, Stats } from "./types";

export interface AreaDef {
  id: string;
  name: string;
  kind: Area["kind"];
  depth: number;
  gang?: string;
  /** Static areas: the drawn map and what its door digits lead to. */
  map?: string;
  doors?: Record<string, string>;
  boss?: string;
  /** Exit marker -> flag that must be set before it opens. */
  locked?: Record<string, string>;
  /** Random districts. */
  gen?: GenKind;
  theme?: StreetTheme;
  /** Where each exit marker leads, and which marker you arrive at there. */
  exits: Record<string, { to: string; arrive: string }>;
  /** How far you can see in the dark (lit areas show everything). */
  sight?: number;
  intro: string;
}

export const AREAS: Record<string, AreaDef> = {};
const def = (d: AreaDef) => {
  AREAS[d.id] = d;
};

def({
  id: "maple",
  name: "Maple Street",
  kind: "town",
  depth: 0,
  map: MAPLE,
  doors: {
    "1": "rosa",
    "2": "kwik",
    "3": "lucky",
    "4": "bolt",
    "5": "ironside",
    "6": "chapter",
    "7": "home",
    "8": "club_maple",
    "9": "board_maple",
    H: "bus_maple",
  },
  exits: { ">": { to: "alleys", arrive: "<" } },
  intro: "Maple Street. Home. The gangs have been creeping closer every week.",
});
def({
  id: "alleys",
  name: "Rustline Alleys",
  kind: "district",
  depth: 1,
  gang: "rats",
  gen: "streets",
  theme: "alley",
  sight: 11,
  exits: { "<": { to: "maple", arrive: ">" }, ">": { to: "scrapyard", arrive: "<" } },
  intro: "Rustline Alleys. Rust Rat graffiti on every wall.",
});
def({
  id: "scrapyard",
  name: "Scrapyard Row",
  kind: "district",
  depth: 2,
  gang: "rats",
  gen: "streets",
  theme: "yard",
  sight: 11,
  exits: { "<": { to: "alleys", arrive: ">" }, ">": { to: "trainyard", arrive: "<" } },
  intro: "Scrapyard Row. Rusted cars and junk piled high.",
});
def({
  id: "trainyard",
  name: "Old Train Yard",
  kind: "static",
  depth: 3,
  gang: "rats",
  map: TRAINYARD,
  boss: "gnash",
  locked: { ">": "gnash" },
  sight: 12,
  exits: { "<": { to: "scrapyard", arrive: ">" }, ">": { to: "harbor", arrive: "<" } },
  intro: "The Old Train Yard. The Rust Rats' hideout. Something big is waiting by the far gate.",
});
def({
  id: "harbor",
  name: "Harbor Market",
  kind: "town",
  depth: 3,
  map: HARBOR,
  doors: {
    "1": "pete",
    "2": "crust",
    "3": "tide",
    "4": "anchor",
    "5": "apoth",
    "6": "riptide",
    "7": "bath",
    "8": "club_harbor",
    "9": "board_harbor",
    H: "bus_harbor",
  },
  exits: {
    "<": { to: "trainyard", arrive: ">" },
    ">": { to: "docks", arrive: "<" },
    "^": { to: "lighthouse", arrive: "v" },
  },
  intro: "Harbor Market. Gulls, salt air, and food stalls as far as you can smell.",
});
def({
  id: "lighthouse",
  name: "Lighthouse Hill",
  kind: "static",
  depth: 3,
  map: LIGHTHOUSE,
  doors: { "1": "hermit", "2": "mae" },
  exits: { v: { to: "harbor", arrive: "^" } },
  intro: "Lighthouse Hill. Quiet, windy. They say an old master lives up here.",
});
def({
  id: "docks",
  name: "Dockside",
  kind: "district",
  depth: 4,
  gang: "vipers",
  gen: "streets",
  theme: "docks",
  sight: 11,
  exits: { "<": { to: "harbor", arrive: ">" }, ">": { to: "cannery", arrive: "<" } },
  intro: "Dockside. Neon Viper tags glow on the pilings. Mind the water.",
});
def({
  id: "cannery",
  name: "Cannery Row",
  kind: "district",
  depth: 5,
  gang: "vipers",
  gen: "streets",
  theme: "warehouse",
  sight: 10,
  exits: { "<": { to: "docks", arrive: ">" }, ">": { to: "pier9", arrive: "<" } },
  intro: "Cannery Row. Old warehouses, stacked crates, too many shadows.",
});
def({
  id: "pier9",
  name: "Pier 9 Warehouse",
  kind: "static",
  depth: 6,
  gang: "vipers",
  map: PIER9,
  boss: "mara",
  locked: { ">": "mara" },
  sight: 12,
  exits: { "<": { to: "cannery", arrive: ">" }, ">": { to: "neon", arrive: "<" } },
  intro: "Pier 9. The Vipers' nest. Music thumps inside the warehouse.",
});
def({
  id: "neon",
  name: "Neon Strip",
  kind: "town",
  depth: 6,
  map: NEON,
  doors: {
    "1": "mikes",
    "2": "juice",
    "3": "arcade",
    "4": "chrome",
    "5": "dojo",
    "6": "nightrx",
    "8": "club_neon",
    "9": "board_neon",
    H: "bus_neon",
  },
  exits: { "<": { to: "pier9", arrive: ">" }, ">": { to: "park", arrive: "<" } },
  intro: "The Neon Strip. Buzzing signs, all-night food, and Crown Tower looming in the distance.",
});
def({
  id: "park",
  name: "Riverside Park",
  kind: "district",
  depth: 7,
  gang: "dogs",
  gen: "park",
  sight: 12,
  exits: { "<": { to: "neon", arrive: ">" }, ">": { to: "subway", arrive: "<" } },
  intro: "Riverside Park. Chrome Dogs prowl between the trees.",
});
def({
  id: "subway",
  name: "Underline Subway",
  kind: "district",
  depth: 8,
  gang: "dogs",
  gen: "tunnel",
  sight: 7,
  exits: { "<": { to: "park", arrive: ">" }, ">": { to: "steelworks", arrive: "<" } },
  intro: "The Underline. Dark tunnels, flickering lamps, distant rumbling.",
});
def({
  id: "steelworks",
  name: "Steelworks Site",
  kind: "district",
  depth: 9,
  gang: "crowns",
  gen: "streets",
  theme: "construction",
  sight: 11,
  exits: { "<": { to: "subway", arrive: ">" }, ">": { to: "lobby", arrive: "<" } },
  intro: "The Steelworks Site, at the foot of Crown Tower. Watch out for open pits.",
});
def({
  id: "lobby",
  name: "Crown Tower Lobby",
  kind: "static",
  depth: 10,
  gang: "crowns",
  map: LOBBY,
  sight: 14,
  exits: { "<": { to: "steelworks", arrive: ">" }, ">": { to: "roof", arrive: "<" } },
  intro: "Crown Tower. Marble, gold trim, and a lot of guards. The elevator is at the far end.",
});
def({
  id: "roof",
  name: "Crown Tower Roof",
  kind: "static",
  depth: 10,
  gang: "crowns",
  map: ROOF,
  boss: "varga",
  sight: 20,
  exits: { "<": { to: "lobby", arrive: ">" } },
  intro: "The roof. Wind howls. Duke Varga waits on the helipad. Don't get knocked off the edge.",
});

for (const [id, name] of [
  ["arena_maple", "The Boiler Room"],
  ["arena_harbor", "The Bilge"],
  ["arena_neon", "The Velvet Pit"],
] as const) {
  def({
    id,
    name,
    kind: "arena",
    depth: 0,
    map: ARENA_MAP,
    exits: {},
    intro: `${name}. The crowd roars as you duck under the ropes.`,
  });
}

export const START_AREA = "maple";

// ---------------------------------------------------------------------------------------------

const LEGEND: Record<string, number> = {
  "#": T.WALL,
  "%": T.CONCRETE,
  W: T.WOODWALL,
  N: T.NEON,
  G: T.GLASS,
  ".": T.SIDEWALK,
  ",": T.ROAD,
  "-": T.LANE,
  '"': T.GRASS,
  T: T.TREE,
  "*": T.BUSH,
  "~": T.WATER,
  "=": T.PLANK,
  ";": T.DIRT,
  ":": T.FLOOR,
  K: T.CARPET,
  S: T.SAND,
  "|": T.FENCE,
  U: T.DUMPSTER,
  C: T.CAR,
  B: T.BENCH,
  L: T.LAMP,
  F: T.FOUNTAIN,
  O: T.PILLAR,
  _: T.COUNTER,
  X: T.CRATES,
  R: T.RAIL,
  P: T.PLATFORM,
  Y: T.PIT,
  I: T.GIRDER,
};

export interface StaticParse {
  w: number;
  h: number;
  tiles: Uint8Array;
  doors: Map<number, string>;
  exits: { x: number; y: number; marker: string }[];
  objects: { x: number; y: number; id: string }[];
  spawns: { x: number; y: number; type: "e" | "E" | "&" }[];
  start: { x: number; y: number } | null;
  /** Letters/digits that had no meaning (for tests). */
  unknown: string[];
}

/** Floor to put under a marker: whatever most of its neighbors are. */
function guessFloor(rows: string[], x: number, y: number): number {
  const counts = new Map<number, number>();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const t = LEGEND[rows[y + dy]?.[x + dx] ?? ""];
    if (t !== undefined && walkable(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: number = T.SIDEWALK;
  let n = 0;
  for (const [t, c] of counts)
    if (c > n) {
      best = t;
      n = c;
    }
  return best;
}

export function parseStatic(map: string, doors: Record<string, string> = {}): StaticParse {
  const rows = map.split("\n").filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(w * h);
  const out: StaticParse = {
    w,
    h,
    tiles,
    doors: new Map(),
    exits: [],
    objects: [],
    spawns: [],
    start: null,
    unknown: [],
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? rows[y][0];
      const i = y * w + x;
      if (LEGEND[ch] !== undefined) {
        tiles[i] = LEGEND[ch];
      } else if (/[1-9]/.test(ch) || ch === "V" || ch === "H") {
        tiles[i] = T.DOOR;
        const shop = ch === "V" ? "v_vend" : doors[ch];
        if (shop) out.doors.set(i, shop);
        else out.unknown.push(ch);
      } else if ("<>^v".includes(ch)) {
        tiles[i] = T.EXIT;
        out.exits.push({ x, y, marker: ch });
      } else if (ch === "@") {
        tiles[i] = guessFloor(rows, x, y);
        out.start = { x, y };
      } else if (ch === "e" || ch === "E" || ch === "&") {
        tiles[i] = guessFloor(rows, x, y);
        out.spawns.push({ x, y, type: ch });
      } else if (OBJECT_BY_LETTER[ch]) {
        tiles[i] = guessFloor(rows, x, y);
        out.objects.push({ x, y, id: OBJECT_BY_LETTER[ch] });
      } else {
        tiles[i] = T.WALL;
        out.unknown.push(ch);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Enemies

let nextEnemyId = 1;

/** A fresh id for a fighter made outside the area builder (partners). */
export function newEnemyId(): number {
  return nextEnemyId++;
}

/** After loading a save, new enemies get ids above every existing one. */
export function reserveEnemyIds(above: number): void {
  nextEnemyId = Math.max(nextEnemyId, above + 1);
}

/** How much tougher gang members are at a depth. */
export function scaleFor(depth: number) {
  return {
    stat: 1 + 0.3 * (depth - 1) + 0.015 * (depth - 1) ** 2,
    hp: 1 + 0.4 * (depth - 1) + 0.03 * (depth - 1) ** 2,
    cash: 1 + 0.65 * (depth - 1),
  };
}

export function makeGangMember(
  rng: Rng,
  gangId: string,
  rank: Rank,
  depth: number,
  x: number,
  y: number,
): Enemy {
  const gang = GANGS[gangId];
  const r = RANKS[rank];
  const sc = scaleFor(Math.max(1, depth));
  const stats = {} as Stats;
  for (const [k, v] of Object.entries(r.base) as [keyof Stats, number][]) {
    stats[k] = Math.round(v * (k === "stamina" ? sc.hp : sc.stat) * (0.9 + rng.next() * 0.2));
  }
  const color: Color = rank === "lieutenant" ? gang.elite : gang.color;
  return {
    id: nextEnemyId++,
    x,
    y,
    hp: stats.stamina,
    maxHp: stats.stamina,
    time: rng.int(0, 60),
    stun: 0,
    down: 0,
    kind: rank,
    name: rng.pick(NICKNAMES),
    title: gang.titles[rank],
    glyph: r.glyph,
    color,
    stats,
    ai: r.ai,
    awake: false,
    windup: null,
    cash: Math.round(rng.int(r.cash[0], r.cash[1]) * sc.cash),
    boss: false,
    cooldown: rng.int(2, 6),
    gang: gangId,
  };
}

export function makeBoss(bossId: string, x: number, y: number): Enemy {
  const b = BOSSES[bossId];
  return {
    id: nextEnemyId++,
    x,
    y,
    hp: b.stats.stamina,
    maxHp: b.stats.stamina,
    time: 50,
    stun: 0,
    down: 0,
    kind: bossId,
    name: b.name,
    title: b.title,
    glyph: b.glyph,
    color: b.color,
    stats: { ...b.stats },
    ai: "boss",
    awake: false,
    windup: null,
    cash: b.cash,
    boss: true,
    cooldown: 3,
    flag: b.flag,
  };
}

function pickRank(rng: Rng, depth: number): Rank {
  return rng.weighted<Rank>([
    ["punk", 40],
    ["scrapper", 22],
    ["slinger", depth >= 3 ? 16 : depth === 2 ? 10 : 5],
    ["bruiser", depth >= 3 ? 14 : depth === 2 ? 7 : 3],
    ["lieutenant", depth >= 3 ? 6 + depth : 0],
  ]);
}

// ---------------------------------------------------------------------------------------------
// Building areas

/**
 * Builds an area for a visit. Layouts are fixed for a game (seeded by game seed + area), but the
 * gangs come back with each visit.
 */
export function buildArea(
  id: string,
  gameSeed: number,
  visit: number,
  flags: Record<string, boolean>,
  /** At night random districts get extra gang members. */
  night = false,
): Area {
  const d = AREAS[id];
  if (!d) throw new Error(`Unknown area ${id}`);
  const layoutSeed = hashSeed(gameSeed, hashString(id));
  const rng = new Rng(hashSeed(layoutSeed, visit + 1));
  let w: number;
  let h: number;
  let tiles: Uint8Array;
  let doors: Map<number, string>;
  let rawExits: { x: number; y: number; marker: string }[];
  let objects: { x: number; y: number; id: string }[];
  let lit: Uint8Array | null = null;
  const enemies: Enemy[] = [];
  let startAt = { x: 0, y: 0 };

  if (d.map) {
    const p = parseStatic(d.map, d.doors);
    ({ w, h, tiles, doors, objects } = p);
    if (p.start) startAt = p.start;
    rawExits = p.exits;
    for (const s of p.spawns) {
      if (s.type === "&") {
        if (d.boss && !flags[BOSSES[d.boss].flag]) enemies.push(makeBoss(d.boss, s.x, s.y));
      } else if (d.gang) {
        // Gang hideouts stay quieter once their boss is beaten.
        if (d.boss && flags[BOSSES[d.boss].flag] && rng.chance(0.6)) continue;
        const rank: Rank = s.type === "E" ? "lieutenant" : pickRank(rng, d.depth);
        enemies.push(makeGangMember(rng, d.gang, rank, d.depth, s.x, s.y));
      }
    }
  } else {
    const g = generateDistrict(layoutSeed, d.gen ?? "streets", d.theme ?? "alley");
    w = g.grid.w;
    h = g.grid.h;
    tiles = g.grid.t;
    doors = g.doors;
    rawExits = g.exits;
    objects = g.objects;
    lit = g.lit;
  }

  const exits: Exit[] = rawExits.map((e) => ({
    ...e,
    ...(d.exits[e.marker] ?? { to: "", arrive: "" }),
  }));
  const items: GroundItem[] = objects.map((o) => ({ kind: "object", ...o }));
  const area: Area = {
    id,
    name: d.name,
    kind: d.kind,
    w,
    h,
    tiles,
    seen: new Uint8Array(w * h),
    doors,
    exits,
    lamp: lit ?? new Uint8Array(w * h),
    enemies,
    items,
    lit: d.kind === "town" || d.kind === "arena" || id === "lighthouse",
    depth: d.depth,
    gang: d.gang ?? null,
    start: startAt,
  };

  if (!d.map && d.gang) spawnDistrictGangs(area, rng, d, night);
  return area;
}

function spawnDistrictGangs(area: Area, rng: Rng, d: AreaDef, night: boolean): void {
  const walk = (x: number, y: number) => walkable(area.tiles[y * area.w + x]);
  const fromExits = distanceMap(area.w, area.h, walk, area.exits);
  const floor: number[] = [];
  for (let i = 0; i < area.tiles.length; i++) {
    const t = area.tiles[i];
    if (walkable(t) && t !== T.DOOR && t !== T.EXIT && fromExits[i] > 12) floor.push(i);
  }
  const groups = 3 + Math.floor(d.depth / 2) + rng.int(0, 2) + (night ? NIGHT_GROUPS : 0);
  const taken = new Set<number>();
  for (let g = 0; g < groups && floor.length > 0; g++) {
    const center = rng.pick(floor);
    const cx = center % area.w;
    const cy = Math.floor(center / area.w);
    const size = rng.int(1, 3);
    for (let n = 0; n < size; n++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = cx + rng.int(-2, 2);
        const y = cy + rng.int(-2, 2);
        const i = y * area.w + x;
        if (x < 0 || y < 0 || x >= area.w || y >= area.h || taken.has(i)) continue;
        if (!walk(x, y) || fromExits[i] <= 10 || area.tiles[i] === T.DOOR) continue;
        taken.add(i);
        area.enemies.push(
          makeGangMember(rng, d.gang as string, pickRank(rng, d.depth), d.depth, x, y),
        );
        break;
      }
    }
  }
}

/** Extra gang groups in random districts at night. */
export const NIGHT_GROUPS = 1;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
