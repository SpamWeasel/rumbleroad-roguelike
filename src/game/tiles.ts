import { C, type Color } from "./colors";

export interface TileDef {
  name: string;
  ch: string;
  fg: Color;
  bg: Color;
  /** Can be walked on. */
  walk: boolean;
  /** Can be seen through. */
  see: boolean;
  /** Fighters knocked onto this tile fall in. */
  hazard?: "water" | "pit";
}

/** Tile ids stored in each area's map. */
export const T = {
  VOID: 0,
  WALL: 1,
  CONCRETE: 2,
  SIDEWALK: 3,
  ROAD: 4,
  LANE: 5,
  GRASS: 6,
  TREE: 7,
  WATER: 8,
  FENCE: 9,
  DUMPSTER: 10,
  CAR: 11,
  BENCH: 12,
  LAMP: 13,
  FOUNTAIN: 14,
  PLANK: 15,
  DIRT: 16,
  PIT: 17,
  GIRDER: 18,
  RAIL: 19,
  PLATFORM: 20,
  FLOOR: 21,
  DOOR: 22,
  EXIT: 23,
  COUNTER: 24,
  CRATES: 25,
  RUBBLE: 26,
  CARPET: 27,
  PILLAR: 28,
  WOODWALL: 29,
  BUSH: 30,
  SAND: 31,
  NEON: 32,
  GLASS: 33,
} as const;

const wall = (name: string, ch: string, fg: Color, bg: Color): TileDef => ({
  name,
  ch,
  fg,
  bg,
  walk: false,
  see: false,
});
const floor = (name: string, ch: string, fg: Color, bg: Color = C.black): TileDef => ({
  name,
  ch,
  fg,
  bg,
  walk: true,
  see: true,
});
const prop = (name: string, ch: string, fg: Color, bg: Color = C.black): TileDef => ({
  name,
  ch,
  fg,
  bg,
  walk: false,
  see: true,
});

export const TILES: TileDef[] = [];
TILES[T.VOID] = wall("nothing", " ", C.black, C.black);
TILES[T.WALL] = wall("brick wall", "#", C.brick, C.brickDark);
TILES[T.CONCRETE] = wall("concrete wall", "#", C.gray, C.dim);
TILES[T.SIDEWALK] = floor("sidewalk", ".", C.concrete, C.night);
TILES[T.ROAD] = floor("road", ".", C.dim, C.asphalt);
TILES[T.LANE] = floor("lane marking", "-", C.amber, C.asphalt);
TILES[T.GRASS] = floor("grass", '"', C.darkGreen);
TILES[T.TREE] = { ...prop("tree", "♣", C.green), see: false };
TILES[T.WATER] = { ...prop("water", "~", C.water, C.deepWater), hazard: "water" };
TILES[T.FENCE] = prop("chain-link fence", "#", C.steel);
TILES[T.DUMPSTER] = prop("dumpster", "■", C.darkGreen, C.night);
TILES[T.CAR] = prop("parked car", "▄", C.red, C.asphalt);
TILES[T.BENCH] = prop("bench", "π", C.wood);
TILES[T.LAMP] = prop("street lamp", "Γ", C.yellow, C.night);
TILES[T.FOUNTAIN] = prop("fountain", "≈", C.cyan, C.navy);
TILES[T.PLANK] = floor("boardwalk", "=", C.wood, C.brickDark);
TILES[T.DIRT] = floor("dirt", ".", C.brown);
TILES[T.PIT] = { ...prop("drop", "░", C.navy, C.black), hazard: "pit" };
TILES[T.GIRDER] = prop("steel girder", "I", C.orange);
TILES[T.RAIL] = floor("rail track", "=", C.gray, C.ink);
TILES[T.PLATFORM] = floor("platform", "·", C.light, C.dark);
TILES[T.FLOOR] = floor("floor", "·", C.dim, C.ink);
TILES[T.DOOR] = floor("door", "+", C.amber, C.black);
TILES[T.EXIT] = floor("way out", ">", C.white, C.navy);
TILES[T.COUNTER] = prop("counter", "_", C.tan);
TILES[T.CRATES] = wall("stacked crates", "▒", C.wood, C.brickDark);
TILES[T.RUBBLE] = floor("rubble", ";", C.gray);
TILES[T.CARPET] = floor("carpet", "·", C.red, C.darkRed);
TILES[T.PILLAR] = wall("pillar", "O", C.light, C.dim);
TILES[T.WOODWALL] = wall("wooden wall", "#", C.wood, C.brickDark);
TILES[T.BUSH] = { ...prop("hedge", "*", C.green), see: true };
TILES[T.SAND] = floor("sand", ".", C.tan);
TILES[T.NEON] = wall("neon wall", "#", C.magenta, C.ink);
TILES[T.GLASS] = prop("glass wall", "▒", C.cyan, C.ink);

export const walkable = (t: number) => TILES[t].walk;
export const transparent = (t: number) => TILES[t].see;
export const isWallLike = (t: number) =>
  t === T.WALL || t === T.CONCRETE || t === T.WOODWALL || t === T.NEON;
