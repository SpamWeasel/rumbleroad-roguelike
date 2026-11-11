// Plays Arcade runs with the bot and prints how far each got.
// Usage: pnpm exec tsx scripts/arcade.mts [runs] [style]
import type { StyleId } from "../src/game/data/styles";
import { playArcade } from "../tests/bot";

const runs = Number(process.argv[2] ?? 12);
const style = (process.argv[3] ?? "allround") as StyleId;
const cleared: number[] = [];
for (let i = 0; i < runs; i++) {
  const r = playArcade(2000 + i * 13, style);
  cleared.push(r.cleared);
  const kinds = r.picks.map((p) => p.split(":")[0]);
  const tally = [...new Set(kinds)].map((k) => `${k} ${kinds.filter((x) => x === k).length}`);
  console.log(
    `seed ${r.seed}: cleared ${r.cleared} waves in ${r.turns} turns; picks: ${tally.join(", ")}`,
  );
}
cleared.sort((a, b) => a - b);
const mean = cleared.reduce((a, b) => a + b, 0) / runs;
console.log(
  `\nWaves cleared: median ${cleared[Math.floor(runs / 2)]}, mean ${mean.toFixed(1)}, best ${cleared[runs - 1]}, worst ${cleared[0]}`,
);
