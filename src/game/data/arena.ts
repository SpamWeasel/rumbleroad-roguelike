import { C, type Color } from "../colors";

/**
 * Underground fight clubs, one hidden in each town. Pay the entry fee, optionally bet on
 * yourself, and beat every wave in the ring. Getting knocked out in the ring costs only the
 * fee and the bet - no lost cash, and never permadeath.
 */
export interface Bout {
  name: string;
  fee: number;
  purse: number;
  /** Gang strength of the challengers. */
  depth: number;
  /** Challengers per wave. */
  waves: number[];
  /** The last wave ends with a named champion. */
  champion?: { name: string; title: string; prize: string; color: Color };
}

export interface Club {
  id: string;
  /** The ring area this club uses. */
  arena: string;
  gangs: string[];
  bouts: Bout[];
}

export const CLUBS: Record<string, Club> = {
  club_maple: {
    id: "club_maple",
    arena: "arena_maple",
    gangs: ["rats"],
    bouts: [
      { name: "Amateur Night", fee: 10, purse: 40, depth: 1, waves: [2, 3] },
      { name: "Contender Bout", fee: 25, purse: 110, depth: 2, waves: [2, 3, 3] },
      {
        name: "Maple Street Title",
        fee: 60,
        purse: 260,
        depth: 3,
        waves: [3, 3, 1],
        champion: {
          name: "Brick Kowalski",
          title: "Maple Street Champ",
          prize: "goldengloves",
          color: C.yellow,
        },
      },
    ],
  },
  club_harbor: {
    id: "club_harbor",
    arena: "arena_harbor",
    gangs: ["vipers", "rats"],
    bouts: [
      { name: "Dockhand Brawl", fee: 40, purse: 160, depth: 4, waves: [2, 3] },
      { name: "Cargo Hold Rumble", fee: 80, purse: 320, depth: 5, waves: [3, 3, 3] },
      {
        name: "Harbor Title",
        fee: 160,
        purse: 700,
        depth: 6,
        waves: [3, 3, 1],
        champion: {
          name: "Shoals Morgan",
          title: "The Harbor Hammer",
          prize: "anchorbelt",
          color: C.cyan,
        },
      },
    ],
  },
  club_neon: {
    id: "club_neon",
    arena: "arena_neon",
    gangs: ["dogs", "crowns"],
    bouts: [
      { name: "Back-Room Scrap", fee: 120, purse: 450, depth: 7, waves: [3, 3] },
      { name: "Main Event", fee: 250, purse: 900, depth: 8, waves: [3, 4, 3] },
      {
        name: "City Title",
        fee: 500,
        purse: 2000,
        depth: 10,
        waves: [3, 3, 1],
        champion: {
          name: "Neon Nell",
          title: "Undisputed City Champ",
          prize: "neonjacket",
          color: C.magenta,
        },
      },
    ],
  },
};

/** A bet on yourself pays back double if you win. */
export const BET_ODDS = 2;

export const ARENA_MAP = `
%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%BBBBBBBBBBBBBBBBBBBBBBBBBB%
%::::::::::::::::::::::::::%
%::||||||||||||||||||||||::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::|KKKKKKKKK@KKKKKKKKKK|::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::|KKKKKKKKKKKKKKKKKKKK|::%
%::||||||||||||||||||||||::%
%::::::::::::::::::::::::::%
%BBBBBBBBBBBBBBBBBBBBBBBBBB%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%
`;
