import { C } from "../../../game/colors";
import { BOSSES, GANGS } from "../../../game/data/enemies";
import { TRIBUTE_BASE, TRIBUTE_DEPTH, TURF_SWEEPS } from "../../../game/data/turf";
import type { Game } from "../../../game/game";
import { AREAS, TURF_AREAS } from "../../../game/world";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import type { Term } from "../term";

const BOX = { x: 6, y: 1, w: 98, h: 34 };

/** The way through the city, west to east (the lighthouse hangs off the harbor). */
const ROUTE = [
  "maple",
  "alleys",
  "scrapyard",
  "trainyard",
  "harbor",
  "lighthouse",
  "pier",
  "docks",
  "cannery",
  "pier9",
  "neon",
  "lantern",
  "park",
  "subway",
  "kennel",
  "ashgate",
  "steelworks",
  "plaza",
  "lobby",
  "roof",
];

/** Every area you've found, which districts are your turf, raids, and bosses beaten. */
export class CityMapScreen implements Screen {
  constructor(private app: App) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || isConfirm(e) || e.code === "KeyN") this.app.pop();
  }

  draw(t: Term): void {
    const g = this.game;
    const { x, y, w, h } = BOX;
    const title = g.s.daily ? `City Map - Daily run ${g.s.daily}` : "City Map";
    t.box(x, y, w, h, C.cyan, title, C.cyan);
    t.text(x + 6, y + 2, "Area", C.gray);
    t.text(x + 32, y + 2, "Who runs it", C.gray);
    t.text(x + 62, y + 2, "Turf", C.gray);
    let yy = y + 3;
    for (const id of ROUTE) {
      const d = AREAS[id];
      // Crown Plaza has a boss too: Baron Voss leads the last wave of the Rumble.
      const bossId = d.boss ?? (id === "plaza" ? "voss" : undefined);
      const seen = !!g.s.visits[id];
      const here = g.area.id === id;
      const branch = ["lighthouse", "pier", "lantern"].includes(id);
      const mark = here ? "@" : d.kind === "town" || branch ? "◆" : bossId ? "▲" : "▪";
      const markColor = here
        ? C.yellow
        : d.kind === "town" || branch
          ? C.cyan
          : bossId
            ? C.red
            : C.gray;
      if (branch) t.text(x + 3, yy, "└", C.dim);
      t.text(x + (branch ? 5 : 3), yy, mark, markColor);
      t.text(
        x + (branch ? 7 : 6),
        yy,
        seen ? d.name : "???",
        here ? C.yellow : seen ? C.white : C.dim,
      );
      // Who runs it.
      if (d.kind === "town" || branch) t.text(x + 32, yy, seen ? "Town - shops" : "", C.cyan);
      else if (bossId) {
        const b = BOSSES[bossId];
        const beaten = !!g.s.flags[b.flag];
        if (seen || beaten)
          t.text(x + 32, yy, `${b.name}${beaten ? " - beaten" : ""}`, beaten ? C.lime : b.color);
      } else if (d.gang && seen) t.text(x + 32, yy, GANGS[d.gang].name, GANGS[d.gang].color);
      // Turf.
      if (TURF_AREAS.includes(id) && seen) {
        const turf = g.s.turf?.[id];
        if (turf?.held) {
          const nx = t.text(x + 62, yy, "YOUR TURF", C.lime);
          if (turf.raid !== null) t.text(nx + 2, yy, "RAID! beat them by dawn", C.red);
          else t.text(nx + 2, yy, `+$${TRIBUTE_BASE + TRIBUTE_DEPTH * d.depth} a day`, C.gold);
        } else {
          const n = turf?.sweeps ?? 0;
          const dots = `${"●".repeat(n)}${"○".repeat(TURF_SWEEPS - n)}`;
          t.text(
            t.text(x + 62, yy, dots, C.amber) + 1,
            yy,
            `cleared ${n} of ${TURF_SWEEPS}`,
            C.gray,
          );
        }
      }
      yy++;
    }
    yy++;
    const held = TURF_AREAS.filter((id) => g.s.turf?.[id]?.held);
    const pay = held.reduce((n, id) => n + TRIBUTE_BASE + TRIBUTE_DEPTH * AREAS[id].depth, 0);
    t.text(
      x + 3,
      yy++,
      held.length
        ? `You hold ${held.length} of ${TURF_AREAS.length} districts. They pay you $${pay} every dawn (5:00).`
        : `You don't hold any turf yet (${TURF_AREAS.length} districts to take).`,
      held.length ? C.lime : C.light,
    );
    const lines = [
      `Knock out every gang member in a street district on ${TURF_SWEEPS} different visits to make it`,
      "your turf: fewer gang crews, 20% off street carts, and cash from the shopkeepers each dawn.",
      "Some mornings a gang raids one of your blocks. Beat them by the next dawn or lose the block.",
    ];
    for (const l of lines) t.text(x + 3, yy++, l, C.gray, undefined, x + w - 2);
    t.text(
      x + 3,
      y + h - 2,
      "@ you   ◆ town   ▪ street district   ▲ gang hideout      Esc close",
      C.dim,
    );
  }
}
