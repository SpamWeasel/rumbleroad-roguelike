import type { Game } from "../../game/game";
import { play, setMusicVolume, setVolume } from "./audio";
import { GamepadInput } from "./gamepad";
import { music, type TrackId } from "./music";
import { saveSettings, settings } from "./settings";
import { deleteSlot, writeSlot, writeSlotNow } from "./storage";
import { Term } from "./term";

export interface Screen {
  draw(t: Term, now: number): void;
  /** Extra drawing on top of the grid (floating numbers). */
  overlay?(ctx: CanvasRenderingContext2D, t: Term, now: number): void;
  key(e: KeyboardEvent): void;
  /** True while something is animating and the screen must keep redrawing. */
  animating?(now: number): boolean;
  /** The play screen: controller buttons map to game actions instead of menu keys. */
  playing?: boolean;
  /** The mouse moved over a grid cell (or left the window: null). */
  hover?(cell: { x: number; y: number } | null): void;
}

/** A pretend key press, used for controller buttons. */
function fakeKey(code: string, repeat: boolean, shift = false): KeyboardEvent {
  return {
    code,
    key: "",
    repeat,
    shiftKey: shift,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault() {},
  } as unknown as KeyboardEvent;
}

/** Owns the canvas, the screen stack, the current game and its save slot. */
export class App {
  readonly term = new Term();
  private stack: Screen[] = [];
  private dirty = true;
  private pad = new GamepadInput();
  private shakeUntil = 0;
  private shakePower = 0;
  /** Brief freeze after a big hit, so it lands with some weight. */
  private stopUntil = 0;
  game: Game | null = null;
  /** Which save slot the current game lives in. */
  slot = 0;
  private savedTurn = -1;
  /** Re-applies the window layout (after the text size changes). */
  relayout: () => void;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2D canvas.");
    const resize = () => {
      this.term.fontScale = settings.textSize === "large" ? 1.14 : 1;
      this.term.layout(canvas, window.innerWidth, window.innerHeight);
      this.dirty = true;
    };
    this.relayout = resize;
    window.addEventListener("resize", resize);
    resize();
    setVolume(settings.volume / 10);
    setMusicVolume(settings.music / 10);
    window.addEventListener("keydown", (e) => {
      if (e.code === "F11") {
        e.preventDefault();
        this.toggleFullscreen();
        return;
      }
      // Keep the browser from scrolling, tabbing away or opening menus.
      const swallow = [
        "Tab",
        "Space",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Slash",
        "F1",
        "Backspace",
      ];
      if (swallow.includes(e.code)) e.preventDefault();
      this.dispatch(e);
    });
    canvas.addEventListener("mousemove", (e) => {
      const t = this.term;
      const x = Math.floor((e.offsetX - t.offX) / t.cellW);
      const y = Math.floor((e.offsetY - t.offY) / t.cellH);
      this.top()?.hover?.(x >= 0 && y >= 0 && x < t.cols && y < t.rows ? { x, y } : null);
      this.dirty = true;
    });
    canvas.addEventListener("mouseleave", () => {
      this.top()?.hover?.(null);
      this.dirty = true;
    });
    // Save on the way out: Electron asks first; a browser tab just closes.
    window.rumblerow?.onClosing(() => this.save());
    window.addEventListener("beforeunload", () => {
      const g = this.game;
      if (!window.rumblerow && g && g.s.over !== "dead")
        writeSlotNow(this.slot, g.summary(), g.save());
    });
    if (settings.fullscreen) void window.rumblerow?.setFullscreen(true);

    const frame = (now: number) => {
      const top = this.top();
      this.pad.poll(now, !!top?.playing, (code, repeat, shift) =>
        this.dispatch(fakeKey(code, repeat, shift)),
      );
      music.play(this.musicFor());
      const shaking = now < this.shakeUntil;
      if (top && (this.dirty || shaking || top.animating?.(now))) {
        this.dirty = false;
        this.term.clear();
        // Draw every screen from the bottom up so pop-ups sit over the game.
        for (const s of this.stack) s.draw(this.term, now);
        const dx = shaking ? Math.round((Math.random() * 2 - 1) * this.shakePower) : 0;
        const dy = shaking ? Math.round((Math.random() * 2 - 1) * this.shakePower) : 0;
        this.term.offX += dx;
        this.term.offY += dy;
        this.term.draw(ctx);
        for (const s of this.stack) s.overlay?.(ctx, this.term, now);
        this.term.offX -= dx;
        this.term.offY -= dy;
        if (shaking) this.dirty = true;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Which tune fits what is on screen. */
  private musicFor(): TrackId | null {
    const g = this.game;
    if (!g || !this.stack.some((s) => s.playing)) return "title";
    if (g.s.over) return g.s.over === "won" ? "town" : null;
    const a = g.area;
    if (a.kind === "arena") return "arena";
    if (g.rumbleOn()) return "boss";
    if (a.enemies.some((e) => (e.boss || e.event === "rival") && e.awake)) return "boss";
    return a.kind === "town" || a.id === "lighthouse" ? "town" : "street";
  }

  private dispatch(e: KeyboardEvent): void {
    if (performance.now() < this.stopUntil) return;
    this.top()?.key(e);
    this.dirty = true;
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(s: Screen): void {
    this.stack.push(s);
    this.dirty = true;
  }

  pop(): void {
    this.stack.pop();
    this.dirty = true;
  }

  /** Replaces the whole stack with one screen. */
  reset(s: Screen): void {
    this.stack = [s];
    this.dirty = true;
  }

  redraw(): void {
    this.dirty = true;
  }

  /** Screen shake (if turned on in Settings) and a short pause on the heaviest hits. */
  impact(power: number): void {
    const now = performance.now();
    if (settings.shake) {
      this.shakePower = Math.max(now < this.shakeUntil ? this.shakePower : 0, power * 2);
      this.shakeUntil = now + 90 + power * 50;
    }
    if (power >= 2) this.stopUntil = now + 70;
  }

  toggleFullscreen(): void {
    settings.fullscreen = !settings.fullscreen;
    saveSettings();
    void window.rumblerow?.setFullscreen(settings.fullscreen);
  }

  /** Saves the current game into its slot (not after a permadeath ending). */
  async save(): Promise<void> {
    const g = this.game;
    if (!g || g.s.over === "dead") return;
    this.savedTurn = g.s.turn;
    await writeSlot(this.slot, g.summary(), g.save());
  }

  /** Saves every so often while playing. */
  autosave(): void {
    const g = this.game;
    if (g && g.s.turn - this.savedTurn >= 40) void this.save();
  }

  async forget(): Promise<void> {
    await deleteSlot(this.slot);
  }

  sound = play;
}
