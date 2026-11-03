/**
 * Turf: clear every gang member out of a street district on TURF_SWEEPS different visits and it
 * becomes yours. Your districts have fewer gang crews and cheaper street vendors, and each dawn
 * the shopkeepers there chip in. Gangs fight back: some mornings one of them raids a district
 * you hold, and if you don't drive the raiders out by the next dawn, the block is theirs again.
 */
export const TURF_SWEEPS = 3;
/** Gang groups taken off a district you hold (it always keeps at least one). */
export const TURF_QUIET = 2;
/** Street vendors in your districts give this discount. */
export const TURF_DISCOUNT = 0.8;
/** Chance each dawn that a gang raids one of your districts. */
export const RAID_CHANCE = 0.35;
/** Each dawn, every district you hold pays this plus TRIBUTE_DEPTH x its depth. */
export const TRIBUTE_BASE = 30;
export const TRIBUTE_DEPTH = 25;
/** Dawn, for tribute and raids (minutes past midnight). */
export const DAWN = 5 * 60;

export interface TurfState {
  /** Visits on which you cleared the district out. */
  sweeps: number;
  held: boolean;
  /** An open raid: the clock minute (from the start of the game) it must be beaten by. */
  raid: number | null;
  /** The visit that last counted as a sweep (one per visit). */
  swept: number;
}

export const RAID_LINES = [
  "Word on the street: the {gang} are moving back into {area}. Get there before dawn!",
  'A kid runs up to you: "The {gang} are trashing {area}! Hurry!" (Beat them before dawn.)',
  'Your phone buzzes. A shopkeeper in {area}: "The {gang} are back. Please come before dawn."',
];
