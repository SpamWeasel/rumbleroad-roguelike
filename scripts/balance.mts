// Plays several full games with the balance bot and prints how each one went.
// Usage: pnpm exec tsx scripts/balance.mts [runs] [maxTurns] [difficulty] [style] [jobs|nojobs] [partner|nopartner]
import type { StyleId } from "../src/game/data/styles";
import { playGame } from "../tests/bot";

const runs = Number(process.argv[2] ?? 6);
const maxTurns = Number(process.argv[3] ?? 60000);
const difficulty = (process.argv[4] ?? "normal") as "easy" | "normal" | "hard";
const style = (process.argv[5] ?? "allround") as StyleId;
const jobs = process.argv[6] !== "nojobs";
const partners = process.argv[7] !== "nopartner";
const route = [
  "maple",
  "alleys",
  "scrapyard",
  "trainyard",
  "harbor",
  "docks",
  "cannery",
  "pier9",
  "neon",
  "park",
  "subway",
  "kennel",
  "ashgate",
  "steelworks",
  "lobby",
  "roof",
];

const reports = [];
for (let i = 0; i < runs; i++) {
  const r = playGame(1000 + i * 7, maxTurns, difficulty, style, jobs, partners);
  reports.push(r);
  const far = route.filter((a) => r.reached[a] !== undefined).pop();
  console.log(
    `\nseed ${r.seed}: ${r.won ? "WON" : `reached ${far}`} in ${r.turns} turns, ${r.deaths} KOs taken, ${r.kos} enemies KO'd, ${r.trips} town visits, jobs ${r.jobsDone}/${r.jobs}, rival beaten ${r.rivalWins}x`,
  );
  console.log(
    `  reached: ${route
      .filter((a) => r.reached[a] !== undefined)
      .map((a) => `${a}@${r.reached[a]}`)
      .join(" ")}`,
  );
  const roof = r.reached.roof;
  if (roof !== undefined)
    console.log(
      `  roof fight: ${(r.bosses.varga ?? r.turns) - roof} turns, deaths on roof ${r.deathsByArea.roof ?? 0}`,
    );
  console.log(
    `  bosses: ${JSON.stringify(r.bosses)}  deaths by area: ${JSON.stringify(r.deathsByArea)}`,
  );
  console.log(`  earned $${r.earned}; spent ${JSON.stringify(r.spent)}`);
  console.log(
    `  final: ${Object.entries(r.stats)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")} | ${r.techniques.join(",")}`,
  );
  for (const [town, snap] of Object.entries(r.snapshots)) console.log(`  at ${town}: ${snap}`);
}
const wins = reports.filter((r) => r.won).length;
console.log(
  `\n${wins}/${runs} won. Median turns: ${reports.map((r) => r.turns).sort((a, b) => a - b)[Math.floor(runs / 2)]}`,
);
