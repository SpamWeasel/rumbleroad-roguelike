/**
 * Arcade Mode: an endless brawl in a parking lot, away from the campaign. Waves of gang members
 * keep coming, a boss every fifth wave, and after each wave you pick one of three upgrades.
 * One life: a knock-out ends the run (smelling salts still save you). Runs aren't saved; the
 * best waves go on the Records board.
 */
export const ARCADE_AREA = "lot";
/** Your style's starting stats are multiplied by this, so wave 1 isn't a pushover fight. */
export const ARCADE_BOOST = 2;
/** A boss leads every this-many waves, in this order (then round again, tougher). */
export const ARCADE_BOSS_EVERY = 5;
export const ARCADE_BOSSES = ["gnash", "mara", "kilo", "voss", "varga"];
/** Friends at your side at once, at most. */
export const ARCADE_FRIENDS = 3;
/** Health back after each wave (share of the maximum), for you and your friends. */
export const ARCADE_REST = 0.3;

/** How big and how tough wave `n` is. */
export function arcadeWave(n: number): { count: number; depth: number; gang: string } {
  const depth = Math.min(16, 1 + Math.floor(n * 0.45));
  const count = Math.min(12, 2 + Math.ceil(n * 0.6));
  const gang = depth <= 3 ? "rats" : depth <= 6 ? "vipers" : depth <= 9 ? "dogs" : "crowns";
  return { count, depth, gang };
}

/** How much a stat upgrade gives on wave `n` (Stamina gets 6x). */
export function arcadeStatGain(n: number): number {
  return 4 + Math.floor(n / 3);
}

/** What the run's loop number makes a boss: the second time round they're much tougher. */
export function arcadeBossScale(n: number): number {
  // Campaign bosses are built for campaign stats: a fifth softer here, the first time round.
  return 0.8 * (1 + 0.4 * Math.floor((n - 1) / (ARCADE_BOSS_EVERY * ARCADE_BOSSES.length)));
}
