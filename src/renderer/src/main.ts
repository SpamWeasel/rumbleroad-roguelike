import { DAY_START, Game } from "../../game/game";
import { walkable } from "../../game/tiles";
import { App } from "./app";
import { loadProfile } from "./profile";
import { ArenaScreen } from "./screens/arena";
import { BoardScreen } from "./screens/board";
import { BusScreen } from "./screens/bus";
import { CharacterScreen } from "./screens/character";
import { AchievementsScreen, EndScreen, HelpScreen, startGame, TitleScreen } from "./screens/menus";
import { ShopScreen } from "./screens/shop";
import { loadSettings } from "./settings";
import { listSlots, readSlot, writeSlot } from "./storage";

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

void boot();

async function boot(): Promise<void> {
  await Promise.all([loadSettings(), loadProfile()]);
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const app = new App(canvas);
  app.reset(new TitleScreen(app));
  const smokeScene = window.rumblerow?.smokeScene;
  if (smokeScene) void smoke(app, smokeScene);
}

/** Smoke tests (scripts/smoke.mjs): show one screen, then tell Electron to take a screenshot. */
async function smoke(app: App, scene: string): Promise<void> {
  const frames = (n: number) =>
    new Promise<void>((resolve) => {
      const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  await frames(10);
  try {
    if (scene === "saves") {
      // Two good saves, then a broken one: loading must fall back to the newest backup.
      const a = Game.create("First", "street", 1).save();
      const b = Game.create("Second", "street", 2).save();
      await writeSlot(1, "save A", a);
      await writeSlot(1, "save B", b);
      await writeSlot(1, "save C", "this is not a game");
      const got = await readSlot(1);
      if (!got?.recovered || got.data !== b)
        errors.push(`backup recovery failed: ${JSON.stringify(got)?.slice(0, 80)}`);
      const slots = await listSlots();
      if (!slots.find((s) => s.slot === 1)?.damaged) errors.push("damaged slot not flagged");
      Game.load(got?.data ?? "");
    } else if (scene === "keys") {
      // Title > Settings > Change keys.
      for (const code of [
        "ArrowDown",
        "Enter",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "ArrowDown",
        "Enter",
      ])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene === "create") {
      // Title > New Game (the first option while there are no saves), then pick Boxer.
      for (const code of ["Enter", "ArrowDown", "ArrowRight"])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene === "settings") {
      // Title > Settings (Settings is the 2nd or 3rd option depending on saves).
      for (const code of ["ArrowDown", "Enter"])
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    } else if (scene !== "title") {
      const play = startGame(app, Game.create("Smoke", "street", 12345), 2);
      for (let i = 0; i < 4; i++) app.game?.move(1, 0);
      play.flush();
      if (scene === "shop") app.push(new ShopScreen(app, "rosa"));
      if (scene === "arena") app.push(new ArenaScreen(app, "club_maple", play));
      if (scene === "help") app.push(new HelpScreen(app));
      if (scene === "achievements") app.push(new AchievementsScreen(app));
      if (scene === "bus") {
        const g = app.game as Game;
        g.s.visits.harbor = 1;
        g.player.cash = 50;
        app.push(new BusScreen(app, "bus_maple", play));
      }
      if (scene === "night") {
        // Maple Street after dark, with a closed bookstore and a partner.
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        g.s.clock = 23 * 60 - DAY_START - g.s.turn;
        if (!g.isNight()) errors.push("clock did not reach night");
        if (g.shopOpen("chapter")) errors.push("bookstore open at night");
        play.flush();
      }
      if (scene === "partner") {
        // Ironside Gym, on the Partner tab.
        (app.game as Game).player.cash = 300;
        app.push(new ShopScreen(app, "ironside"));
        for (const code of ["Tab", "Tab"])
          window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      }
      if (scene === "sheet") {
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        g.player.techniques = ["haymaker", "uppercut"];
        g.player.gear.hands = "tgloves";
        app.push(new CharacterScreen(app));
      }
      if (scene === "ending") {
        const g = app.game as Game;
        g.s.over = "won";
        app.push(new EndScreen(app, "won"));
        // New Game+ must start cleanly from a won game.
        const plus = Game.newGamePlus(g, 99);
        if (plus.s.plus !== 1) errors.push("New Game+ did not start");
      }
      if (scene === "board") {
        const g = app.game as Game;
        const first = g.boardOffers("board_maple")[0];
        if (!first || !g.takeJob("board_maple", first.id).ok) errors.push("could not take a job");
        app.push(new BoardScreen(app, "board_maple"));
      }
      if (scene === "street") {
        // A district with a job on the go, a shakedown and the rival about.
        const g = app.game as Game;
        g.player.cash = 300;
        g.hirePartner("ironside");
        for (const job of g.boardOffers("board_maple")) g.takeJob("board_maple", job.id);
        const inside = g as unknown as {
          enterArea(id: string, arrive: string): void;
          spawnRival(): void;
        };
        for (let i = 0; i < 40 && !g.area.items.some((it) => it.kind === "npc"); i++)
          inside.enterArea("alleys", "<");
        inside.spawnRival();
        for (const e of g.area.enemies) e.awake = e.event === "rival" || e.event === "shakedown";
        // Walk toward the trouble so it shows on screen.
        const npc = g.area.items.find((it) => it.kind === "npc");
        if (!npc) errors.push("no shakedown happened");
        else {
          let best: { x: number; y: number } | null = null;
          for (let dy = -5; dy <= 5; dy++)
            for (let dx = -5; dx <= 5; dx++) {
              const x = npc.x + dx;
              const y = npc.y + dy;
              const far = Math.max(Math.abs(dx), Math.abs(dy)) >= 4;
              if (far && !best && walkable(g.tileAt(x, y)) && !g.enemyAt(x, y)) best = { x, y };
            }
          if (best) {
            g.player.x = best.x;
            g.player.y = best.y;
          }
          const pal = g.ally();
          const near = best
            ? [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
                [1, 1],
                [-1, -1],
                [1, -1],
                [-1, 1],
              ]
                .map(([dx, dy]) => ({
                  x: (best as { x: number }).x + dx,
                  y: (best as { y: number }).y + dy,
                }))
                .find((q) => walkable(g.tileAt(q.x, q.y)) && !g.enemyAt(q.x, q.y))
            : undefined;
          if (pal && near) {
            pal.x = near.x;
            pal.y = near.y;
          }
          // Lit up so the screenshot shows everything.
          g.area.lit = true;
          g.updateView();
        }
        play.flush();
      }
      if (scene === "bout") {
        const g = app.game as Game;
        g.player.cash = 100;
        g.startBout("club_maple", 0, 10);
        play.flush();
        // Point the mouse at a challenger to show the info box (the small ring is centered).
        const e = g.area.enemies[0];
        if (e)
          play.hover({
            x: e.x + Math.floor((76 - g.area.w) / 2),
            y: e.y + Math.floor((26 - g.area.h) / 2),
          });
      }
      // A save written mid-area loads back.
      if (scene === "game") Game.load((app.game as Game).save());
    }
  } catch (err) {
    errors.push(String(err));
  }
  await frames(20);
  window.rumblerow?.signalReady({
    ok: errors.length === 0,
    scene,
    detail: errors.join("; ") || undefined,
  });
}
