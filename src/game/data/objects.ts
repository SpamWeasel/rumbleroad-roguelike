import { C, type Color } from "../colors";

/** Things lying around that you can pick up (G) and swing or throw (T). */
export interface ObjectDef {
  id: string;
  name: string;
  glyph: string;
  color: Color;
  /** Thrown damage before strength. */
  thrown: number;
  /** Squares the target is knocked back when hit by the throw. */
  knock: number;
  /** Breaks when thrown (otherwise it lands and can be picked up again). */
  breaks: boolean;
  /** Can be swung instead of punching: base damage and how many swings it lasts. */
  swing?: { damage: number; uses: number };
  /** Map letter in static maps. */
  letter: string;
}

const objects: ObjectDef[] = [
  {
    id: "crate",
    name: "wooden crate",
    glyph: "▪",
    color: C.wood,
    thrown: 11,
    knock: 1,
    breaks: true,
    letter: "c",
  },
  {
    id: "trashcan",
    name: "trash can",
    glyph: "Ö",
    color: C.steel,
    thrown: 9,
    knock: 1,
    breaks: false,
    letter: "t",
  },
  {
    id: "pipe",
    name: "lead pipe",
    glyph: "/",
    color: C.steel,
    thrown: 9,
    knock: 0,
    breaks: false,
    swing: { damage: 6, uses: 14 },
    letter: "p",
  },
  {
    id: "bat",
    name: "baseball bat",
    glyph: "/",
    color: C.tan,
    thrown: 8,
    knock: 0,
    breaks: false,
    swing: { damage: 8, uses: 10 },
    letter: "b",
  },
  {
    id: "brick",
    name: "brick",
    glyph: "∙",
    color: C.brick,
    thrown: 8,
    knock: 0,
    breaks: true,
    letter: "k",
  },
  {
    id: "tire",
    name: "old tire",
    glyph: "o",
    color: C.dim,
    thrown: 9,
    knock: 2,
    breaks: false,
    letter: "r",
  },
  {
    id: "chain",
    name: "bike chain",
    glyph: "§",
    color: C.light,
    thrown: 6,
    knock: 0,
    breaks: false,
    swing: { damage: 7, uses: 16 },
    letter: "n",
  },
];

export const OBJECTS: Record<string, ObjectDef> = Object.fromEntries(objects.map((o) => [o.id, o]));
export const OBJECT_BY_LETTER: Record<string, string> = Object.fromEntries(
  objects.map((o) => [o.letter, o.id]),
);
export const STREET_LITTER = [
  "crate",
  "trashcan",
  "trashcan",
  "pipe",
  "brick",
  "brick",
  "tire",
  "bat",
  "chain",
];
