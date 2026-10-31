import { Game } from "../../game/game";
import { App } from "./app";
import { ArenaScreen } from "./screens/arena";
import { startGame, TitleScreen } from "./screens/menus";
import { ShopScreen } from "./screens/shop";
import { loadSettings } from "./settings";
import { listSlots, readSlot, writeSlot } from "./storage";

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

void boot();

async function boot(): Promise<void> {
  await loadSettings();
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
        "Enter",
      ])
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
