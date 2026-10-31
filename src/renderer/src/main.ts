import { Game } from "../../game/game";
import { App } from "./app";
import { startGame, TitleScreen } from "./screens/menus";
import { ShopScreen } from "./screens/shop";

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const app = new App(canvas);
app.reset(new TitleScreen(app));

const smokeScene = window.rumblerow?.smokeScene;
if (smokeScene) void smoke(smokeScene);

/** Smoke tests (scripts/smoke.mjs): show one screen, then tell Electron to take a screenshot. */
async function smoke(scene: string): Promise<void> {
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
    if (scene === "game" || scene === "shop") {
      const play = startGame(app, Game.create("Smoke", "street", 12345));
      for (let i = 0; i < 4; i++) app.game?.move(1, 0);
      play.flush();
      if (scene === "shop") app.push(new ShopScreen(app, "rosa"));
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
