import { C } from "../../../game/colors";
import { CLUBS } from "../../../game/data/arena";
import { BOSSES } from "../../../game/data/enemies";
import { ITEMS } from "../../../game/data/items";
import { RIVAL } from "../../../game/data/jobs";
import { PARTNERS } from "../../../game/data/partners";
import { STYLES } from "../../../game/data/styles";
import { TECHNIQUES } from "../../../game/data/techniques";
import type { Game } from "../../../game/game";
import {
  ALL_STATS,
  DIFFICULTY,
  GEAR_SLOT_LABEL,
  GEAR_SLOTS,
  STAT_LABEL,
} from "../../../game/types";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { Term } from "../term";

const BOX = { x: 4, y: 1, w: 102, h: 34 };

/** Everything about your fighter on one page: stats and where they come from, moves, records. */
export class CharacterScreen implements Screen {
  constructor(private app: App) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || isConfirm(e) || e.code === "KeyP") this.app.pop();
  }

  draw(t: Term): void {
    const g = this.game;
    const p = g.player;
    const { x, y, w, h } = BOX;
    const style = STYLES[p.style];
    t.box(x, y, w, h, C.yellow, p.name.toUpperCase(), C.yellow);

    // Who you are.
    let ly = y + 2;
    const lx = x + 3;
    t.text(lx, ly++, `${style?.name ?? "Fighter"}`, C.white);
    for (const l of Term.wrap(style?.perk ?? "", 44)) t.text(lx, ly++, l, C.lime);
    const rules = g.s.mode === "permadeath" ? "Permadeath" : "Street Rules";
    const plus = g.s.plus ? `, New Game+ ${g.s.plus}` : "";
    t.text(lx, ly++, `${DIFFICULTY[g.s.difficulty].label}, ${rules}${plus}`, C.gray);
    ly++;

    // Stats: base, plus gear and boosts.
    t.text(lx, ly, "STAT", C.gray);
    t.text(lx + 12, ly, "BASE", C.gray);
    t.text(lx + 19, ly, "GEAR", C.gray);
    t.text(lx + 26, ly, "BOOST", C.gray);
    t.text(lx + 34, ly++, "TOTAL", C.gray);
    for (const k of ALL_STATS) {
      const base = p.base[k];
      let gear = 0;
      for (const id of Object.values(p.gear)) if (id) gear += ITEMS[id]?.stats?.[k] ?? 0;
      let boost = 0;
      for (const b of p.buffs) boost += b.stats[k] ?? 0;
      t.text(lx, ly, STAT_LABEL[k], C.light);
      t.text(lx + 12, ly, String(base).padStart(4), C.white);
      t.text(lx + 19, ly, gear ? `+${gear}`.padStart(4) : "   -", gear ? C.cyan : C.dim);
      t.text(lx + 26, ly, boost ? `+${boost}`.padStart(4) : "   -", boost ? C.lime : C.dim);
      t.text(lx + 34, ly++, String(g.stat(k)).padStart(4), C.yellow);
    }
    t.text(lx, ly++, `Health ${p.hp}/${g.maxHp()}   Guts ${p.guts}/${g.maxGuts()}`, C.gray);
    ly++;

    t.text(lx, ly++, "WORN", C.gray);
    for (const slot of GEAR_SLOTS) {
      const id = p.gear[slot];
      t.text(lx, ly, GEAR_SLOT_LABEL[slot], C.light);
      t.text(lx + 8, ly++, id ? ITEMS[id].name : "-", id ? C.white : C.dim, undefined, lx + 46);
    }
    ly++;
    t.text(lx, ly++, "PARTNER", C.gray);
    const pt = g.s.partner;
    if (pt) {
      const def = PARTNERS[pt.id];
      const st = g.partnerStats(pt.id);
      const status = pt.out ? "out cold - back in the next town" : `${def.title}`;
      t.text(t.text(lx, ly, def.name, def.color) + 2, ly++, status, C.gray);
      t.text(
        lx,
        ly++,
        `PUN ${st.punch} KIK ${st.kick} STR ${st.strength} AGI ${st.agility} DEF ${st.defense}`,
        C.light,
      );
    } else t.text(lx, ly++, "None. Each gym has a fighter who'll team up with you.", C.dim);

    // Moves and records, on the right.
    const rx = x + 54;
    let ry = y + 2;
    t.text(rx, ry++, "SPECIAL MOVES", C.gray);
    if (p.techniques.length === 0) t.text(rx, ry++, "None yet. Gyms teach them.", C.dim);
    p.techniques.forEach((id, i) => {
      const tech = TECHNIQUES[id];
      t.text(rx, ry, `${i + 1} ${tech.name}`, C.white);
      t.text(rx + 22, ry++, `${tech.guts} guts`, C.amber);
    });
    ry++;
    t.text(rx, ry++, "RECORD", C.gray);
    const rival = g.s.rival;
    const rivalLine =
      rival.wins >= RIVAL.wins
        ? `beaten ${rival.wins} times - he's a friend now`
        : rival.met
          ? `beaten ${rival.wins} of ${rival.met} meetings`
          : "not met yet";
    const bosses = Object.values(BOSSES).filter((b) => g.s.flags[b.flag]);
    const titles = Object.keys(CLUBS).filter((c) => g.s.flags[`title_${c}`]).length;
    const rows: [string, string][] = [
      ["Gang members KO'd", String(p.kos)],
      ["Bosses beaten", bosses.length ? bosses.map((b) => b.name).join(", ") : "none yet"],
      ["Fight club titles", `${titles} of ${Object.keys(CLUBS).length}`],
      ["Jobs done", String(g.s.tally.jobs)],
      ["People rescued", String(g.s.tally.rescues)],
      [`${RIVAL.name}`, rivalLine],
      ["Turns", String(g.s.turn)],
      ["Cash", `$${p.cash}`],
    ];
    for (const [k, v] of rows) {
      t.text(rx, ry, k, C.light);
      t.text(rx + 20, ry++, v, C.white, undefined, x + w - 2);
    }

    t.text(x + 3, y + h - 2, "Esc or Enter to close", C.dim);
  }
}
