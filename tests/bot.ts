/**
 * A bot that plays Rumble Row the way a sensible player would, for balance testing:
 * push east fighting gangs, retreat when hurt or rich, shop in town (techniques, gear, food,
 * training, carry-out heals), and come back stronger. Used by scripts/balance.mts.
 */
import { BOSSES } from "../src/game/data/enemies";
import { ITEMS } from "../src/game/data/items";
import { SHOPS } from "../src/game/data/shops";
import { TECHNIQUES } from "../src/game/data/techniques";
import { Game } from "../src/game/game";
import { canStep, distanceMap } from "../src/game/grid";
import { T, walkable } from "../src/game/tiles";
import { ALL_STATS, type AnyStat, DIRS8, type Dir, type Enemy, STAT_KEYS } from "../src/game/types";
import { AREAS } from "../src/game/world";

export interface RunReport {
  seed: number;
  turns: number;
  won: boolean;
  deaths: number;
  deathsByArea: Record<string, number>;
  /** Turn each area was first reached. */
  reached: Record<string, number>;
  /** Turn each boss was beaten. */
  bosses: Record<string, number>;
  spent: Record<string, number>;
  earned: number;
  kos: number;
  trips: number;
  stats: Record<string, number>;
  techniques: string[];
  /** Snapshots when each town was first reached. */
  snapshots: Record<string, string>;
}

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function playGame(seed: number, maxTurns = 60000): RunReport {
  const g = Game.create("Bot", "street", seed);
  const r: RunReport = {
    seed,
    turns: 0,
    won: false,
    deaths: 0,
    deathsByArea: {},
    reached: { maple: 0 },
    bosses: {},
    spent: { food: 0, gear: 0, tech: 0, train: 0, tonic: 0, book: 0, service: 0 },
    earned: 0,
    kos: 0,
    trips: 0,
    stats: {},
    techniques: [],
    snapshots: {},
  };
  let mode: "push" | "retreat" = "push";
  let shoppedIn: unknown = null;
  let cashAfterShop = 0;
  let lastSpend = 1;
  let cashBefore = g.player.cash;
  let stuck = 0;
  let lastPos = "";

  const snapshot = () =>
    `${ALL_STATS.map((k) => `${k.slice(0, 3)} ${g.stat(k)}`).join(" ")} | techs ${g.player.techniques.length} | gear ${Object.values(g.player.gear).join(",")}`;

  while (g.s.turn < maxTurns && !g.s.over) {
    const area = g.area;
    if (r.reached[area.id] === undefined) {
      r.reached[area.id] = g.s.turn;
      if (area.kind === "town") r.snapshots[area.id] = snapshot();
    }
    if (area.kind === "town" && shoppedIn !== area) {
      const before = g.player.cash;
      shop(g, r);
      lastSpend = before - g.player.cash;
      shoppedIn = area;
      cashAfterShop = g.player.cash;
      mode = "push";
      r.trips++;
    }
    const startTurn = g.s.turn;
    const where = area.id;
    act();
    // Bookkeeping from what happened.
    for (const ev of g.events) {
      if (ev.type === "dead") {
        r.deaths++;
        r.deathsByArea[where] = (r.deathsByArea[where] ?? 0) + 1;
        mode = "push";
      }
    }
    g.events.length = 0;
    for (const b of Object.values(BOSSES))
      if (g.s.flags[b.flag] && r.bosses[b.id] === undefined) r.bosses[b.id] = g.s.turn;
    if (g.player.cash > cashBefore) r.earned += g.player.cash - cashBefore;
    cashBefore = g.player.cash;
    // Never spin without time passing.
    const pos = `${g.area.id}:${g.player.x},${g.player.y}`;
    if (g.s.turn === startTurn && pos === lastPos) {
      if (++stuck > 3) {
        g.wait();
        stuck = 0;
      }
    } else stuck = 0;
    lastPos = pos;
  }

  r.turns = g.s.turn;
  r.won = g.s.over === "won";
  r.kos = g.player.kos;
  r.techniques = [...g.player.techniques];
  for (const k of ALL_STATS) r.stats[k] = g.stat(k);
  return r;

  function act(): void {
    const p = g.player;
    const area = g.area;
    if (area.kind === "town") {
      stepTo(exitsOf(">"));
      return;
    }
    const frac = p.hp / g.maxHp();
    const adj = g.adjacentEnemies();
    // Drink or eat something when in trouble.
    if (frac < 0.35) {
      const idx = p.pockets.findIndex((id) => ITEMS[id].heal);
      if (idx >= 0) {
        g.useItem(idx);
        return;
      }
    }
    // Rich enough to go shopping, or too hurt to keep pushing.
    const tier = townTier(g.s.lastTown);
    if (
      mode === "push" &&
      (frac < 0.3 ||
        ((lastSpend > 40 || g.player.cash > cashAfterShop + 1500) &&
          g.player.cash > cashAfterShop + 300 * tier * tier))
    )
      mode = "retreat";
    // Dodge a telegraphed big hit.
    const threat = g.area.enemies.find((e) => e.windup && threatens(e, p));
    if (threat) {
      const safe = DIRS8.filter((d) => {
        const x = p.x + d[0];
        const y = p.y + d[1];
        return free(x, y) && !g.area.enemies.some((e) => e.windup && threatensAt(e, x, y));
      });
      if (safe.length) {
        g.move(safe[0][0], safe[0][1]);
        return;
      }
      g.guard();
      return;
    }
    if (adj.length) {
      fight(adj.map((a) => ({ e: a.enemy, dir: a.dir })));
      return;
    }
    if (mode === "retreat") {
      if (frac < 0.6 && g.visibleEnemies().filter((e) => e.awake).length === 0) {
        const rested = g.rest();
        if (rested > 0) return;
      }
      stepTo(exitsOf("<"));
      return;
    }
    // Chase awake gang members nearby, else head for the exit (or the boss guarding it).
    const foes = g.visibleEnemies().filter((e) => e.awake && cheb(e, p) <= 8);
    if (foes.length && stepTo([foes[0]], true)) return;
    const d = AREAS[area.id];
    const lockedBy = d.locked?.[">"];
    if (lockedBy && !g.s.flags[lockedBy]) {
      const boss = area.enemies.find((e) => e.boss);
      if (boss) {
        stepTo([boss], true);
        return;
      }
    }
    if (area.id === "roof") {
      const boss = area.enemies.find((e) => e.boss);
      if (boss) {
        stepTo([boss], true);
        return;
      }
    }
    // Clear leftover enemies sometimes for cash; otherwise move on.
    stepTo(exitsOf(">"));
  }

  function fight(adj: { e: Enemy; dir: Dir }[]): void {
    const p = g.player;
    adj.sort((a, b) => a.e.hp - b.e.hp);
    const target = adj[0];
    const techs = p.techniques
      .map((id, i) => ({ t: TECHNIQUES[id], i }))
      .filter(({ t }) => p.guts >= t.guts);
    const around = techs.filter(({ t }) => t.aim === "around").sort((a, b) => b.t.guts - a.t.guts);
    if (adj.length >= 2 && around.length) {
      g.technique(around[0].i, null);
      return;
    }
    const aimed = techs
      .filter(({ t }) => t.aim === "dir" && t.id !== "toss")
      .sort((a, b) => b.t.guts - a.t.guts);
    if (aimed.length && (target.e.hp > 12 || target.e.boss)) {
      g.technique(aimed[0].i, target.dir);
      return;
    }
    if (g.stat("kick") > g.stat("punch") + 2) g.kick(target.dir);
    else g.punch(target.dir);
  }

  function free(x: number, y: number): boolean {
    const t = g.tileAt(x, y);
    return (
      walkable(t) &&
      t !== T.EXIT &&
      t !== T.DOOR &&
      !g.enemyAt(x, y) &&
      !(g.player.x === x && g.player.y === y)
    );
  }

  function threatens(e: Enemy, p: { x: number; y: number }): boolean {
    return threatensAt(e, p.x, p.y);
  }

  function threatensAt(e: Enemy, x: number, y: number): boolean {
    if (!e.windup) return false;
    if (e.windup.move === "crusher") return cheb(e, { x, y }) === 1;
    return e.x + e.windup.dir[0] === x && e.y + e.windup.dir[1] === y;
  }

  function exitsOf(marker: string): { x: number; y: number }[] {
    const list = g.area.exits.filter((e) => e.marker === marker);
    return list.length ? list : g.area.exits;
  }

  /** One step along the shortest path to any target; bumps (attacks) enemies in the way. */
  function stepTo(targets: { x: number; y: number }[], toEnemy = false): boolean {
    const a = g.area;
    const p = g.player;
    const isTarget = new Set(targets.map((t) => t.y * a.w + t.x));
    const walk = (x: number, y: number) => {
      const i = y * a.w + x;
      if (isTarget.has(i)) return true;
      const t = g.tileAt(x, y);
      return walkable(t) && t !== T.DOOR && t !== T.EXIT;
    };
    const dist = distanceMap(a.w, a.h, walk, targets);
    let best: Dir | null = null;
    let bd = dist[p.y * a.w + p.x];
    if (bd < 0) bd = 9999;
    for (const d of DIRS8) {
      const x = p.x + d[0];
      const y = p.y + d[1];
      if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
      const v = dist[y * a.w + x];
      if (v < 0 || v >= bd || !canStep(walk, p.x, p.y, d[0], d[1])) continue;
      if (g.enemyAt(x, y) && !toEnemy && !isTarget.has(y * a.w + x)) {
        // Someone in the way: fight through.
      }
      bd = v;
      best = d;
    }
    if (!best) {
      if (!toEnemy) g.wait();
      return false;
    }
    if (!g.move(best[0], best[1])) g.wait();
    return true;
  }
}

/** How much the bot values one point of each stat. */
const WEIGHT: Record<AnyStat, number> = {
  punch: 1,
  kick: 0.8,
  defense: 1,
  agility: 0.9,
  stamina: 0.4,
  strength: 0.6,
  guts: 0.3,
};

function townTier(town: string): number {
  return town === "maple" ? 1 : town === "harbor" ? 2 : 3;
}

/** Spends money in the current town the way a careful player would. */
function shop(g: Game, r: RunReport): void {
  const town = g.area.id;
  const shops = [...new Set([...g.area.doors.values()])].map((id) => SHOPS[id]).filter(Boolean);
  const buy = (shopId: string, itemId: string, bag = false) => {
    const item = ITEMS[itemId];
    const before = g.player.cash;
    const res = g.buy(shopId, itemId, bag);
    if (res.ok) r.spent[item.kind] = (r.spent[item.kind] ?? 0) + (before - g.player.cash);
    return res.ok;
  };
  const p = g.player;
  // Free or cheap full heals.
  if (town === "maple") buy("home", "nap");
  else if (town === "harbor" && p.hp < g.maxHp() * 0.8) buy("bath", "soak");
  // Techniques first: they're the big power jumps.
  for (const s of shops) {
    for (const id of s.gym?.techniques ?? []) {
      if (g.learnBlocker(id) === null) {
        const before = p.cash;
        if (g.learn(s.id, id).ok) r.spent.tech += before - p.cash;
      }
    }
  }
  // Gear upgrades worth the money.
  const score = (id: string | undefined) => {
    if (!id) return 0;
    const st = ITEMS[id].stats ?? {};
    return Object.entries(st).reduce((n, [k, v]) => n + (k === "guts" ? v * 0.6 : v), 0);
  };
  for (const s of shops) {
    for (const id of s.stock) {
      const item = ITEMS[id];
      if (item.kind !== "gear" || !item.slot) continue;
      if (score(id) > score(p.gear[item.slot]) + 1 && item.price <= p.cash * 0.75) buy(s.id, id);
    }
  }
  // Books.
  for (const s of shops)
    for (const id of s.stock)
      if (ITEMS[id].kind === "book" && ITEMS[id].price <= p.cash * 0.6) buy(s.id, id);
  // Keep two heals in pocket.
  const heals = () => p.pockets.filter((id) => ITEMS[id].heal).length;
  for (const s of shops) {
    for (const id of ["firstaid", "herbal", "bandage", "candy"]) {
      while (
        s.stock.includes(id) &&
        heals() < 2 &&
        p.cash > ITEMS[id].price + 10 &&
        p.pockets.length < 6
      ) {
        if (!buy(s.id, id)) break;
      }
    }
  }
  // Food (and stat services) with the best stat gain per dollar.
  for (let n = 0; n < 200; n++) {
    let best: { shop: string; id: string; value: number } | null = null;
    for (const s of shops) {
      for (const line of g.shopLines(s.id)) {
        const item = line.item;
        if (
          !item.stats ||
          item.kind === "gear" ||
          item.kind === "book" ||
          line.noGain ||
          item.price <= 0
        )
          continue;
        let pts = 0;
        for (const [k, v] of Object.entries(item.stats) as [AnyStat, number][]) {
          const cap = item.upTo ?? 99;
          const limit = k === "stamina" ? cap * 3 : cap;
          if (p.base[k] < limit) pts += v * WEIGHT[k];
        }
        if (pts <= 0) continue;
        const value = pts / item.price;
        if (!best || value > best.value) best = { shop: s.id, id: item.id, value };
      }
    }
    if (!best || ITEMS[best.id].price > p.cash) break;
    if (!buy(best.shop, best.id)) break;
  }
  // Leftover cash goes into gym training.
  const gym = shops.find((s) => s.gym);
  if (gym) {
    for (let n = 0; n < 100; n++) {
      const options = ALL_STATS.filter((k) => k !== "guts" && g.canTrain(gym.id, k)).map((k) => ({
        k,
        price: g.trainPrice(gym.id, k) / (WEIGHT[k] * (k === "stamina" ? 3 : 1)),
      }));
      options.sort((a, b) => a.price - b.price);
      const o = options[0];
      if (!o || g.trainPrice(gym.id, o.k) > p.cash) break;
      const before = p.cash;
      if (!g.train(gym.id, o.k).ok) break;
      r.spent.train += before - p.cash;
    }
  }
  // Top up health with cheap food if still hurt.
  for (let n = 0; n < 30 && p.hp < g.maxHp() * 0.9; n++) {
    let pick: { shop: string; id: string } | null = null;
    for (const s of shops)
      for (const id of s.stock) {
        const it = ITEMS[id];
        if (
          (it.kind === "food" || it.kind === "service") &&
          typeof it.heal === "number" &&
          it.price <= p.cash &&
          (!pick || it.heal / it.price > (ITEMS[pick.id].heal as number) / ITEMS[pick.id].price)
        )
          pick = { shop: s.id, id };
      }
    if (!pick || !buy(pick.shop, pick.id)) break;
  }
  void STAT_KEYS;
}
