import { C } from "../../game/colors";

export const COLS = 110;
export const ROWS = 37;

/** A grid of colored characters drawn to a canvas. Every screen draws into one of these. */
export class Term {
  readonly ch: string[];
  readonly fg: string[];
  readonly bg: string[];
  cellW = 12;
  cellH = 21;
  offX = 0;
  offY = 0;
  private font = "";

  constructor(
    readonly cols = COLS,
    readonly rows = ROWS,
  ) {
    const n = cols * rows;
    this.ch = new Array(n).fill(" ");
    this.fg = new Array(n).fill(C.light);
    this.bg = new Array(n).fill(C.black);
  }

  clear(): void {
    this.ch.fill(" ");
    this.fg.fill(C.light);
    this.bg.fill(C.black);
  }

  put(x: number, y: number, ch: string, fg: string = C.light, bg?: string): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.ch[i] = ch;
    this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
  }

  setBg(x: number, y: number, bg: string): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.bg[y * this.cols + x] = bg;
  }

  /** Writes text; returns the x after it. Clips at maxX. */
  text(
    x: number,
    y: number,
    s: string,
    fg: string = C.light,
    bg?: string,
    maxX = this.cols,
  ): number {
    for (const c of s) {
      if (x >= maxX) break;
      this.put(x++, y, c, fg, bg);
    }
    return x;
  }

  center(y: number, s: string, fg: string = C.light, x0 = 0, w = this.cols): void {
    this.text(x0 + Math.floor((w - s.length) / 2), y, s, fg);
  }

  fill(
    x: number,
    y: number,
    w: number,
    h: number,
    ch = " ",
    fg: string = C.light,
    bg: string = C.black,
  ): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.put(xx, yy, ch, fg, bg);
  }

  box(
    x: number,
    y: number,
    w: number,
    h: number,
    fg: string = C.gray,
    title?: string,
    titleFg: string = C.yellow,
  ): void {
    this.fill(x, y, w, h, " ", C.light, C.ink);
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      this.put(xx, y, "─", fg);
      this.put(xx, y + h - 1, "─", fg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      this.put(x, yy, "│", fg);
      this.put(x + w - 1, yy, "│", fg);
    }
    this.put(x, y, "┌", fg);
    this.put(x + w - 1, y, "┐", fg);
    this.put(x, y + h - 1, "└", fg);
    this.put(x + w - 1, y + h - 1, "┘", fg);
    if (title) this.text(x + 2, y, ` ${title} `, titleFg);
  }

  /** Word-wraps text into lines no wider than `w`. */
  static wrap(s: string, w: number): string[] {
    const lines: string[] = [];
    for (const para of s.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        if (line.length + word.length + (line ? 1 : 0) > w) {
          if (line) lines.push(line);
          line = word.length > w ? word.slice(0, w) : word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Fits the grid into the canvas's CSS size and sets up crisp drawing. */
  layout(canvas: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.cellW = Math.max(4, Math.floor(width / this.cols));
    this.cellH = Math.max(8, Math.floor(height / this.rows));
    // Keep characters roughly as tall as a terminal's.
    this.cellH = Math.min(this.cellH, Math.floor(this.cellW * 2.1));
    this.cellW = Math.min(this.cellW, Math.floor(this.cellH * 0.62));
    const cw = this.cellW * this.cols;
    const chh = this.cellH * this.rows;
    this.offX = Math.floor((width - cw) / 2);
    this.offY = Math.floor((height - chh) / 2);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const size = Math.floor(Math.min(this.cellH * 0.86, this.cellW / 0.56));
    this.font = `${size}px Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Courier New", monospace`;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.translate(this.offX, this.offY);
    const { cellW, cellH, cols } = this;
    for (let i = 0; i < this.ch.length; i++) {
      if (this.bg[i] === C.black) continue;
      ctx.fillStyle = this.bg[i];
      ctx.fillRect((i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH);
    }
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let last = "";
    for (let i = 0; i < this.ch.length; i++) {
      const c = this.ch[i];
      if (c === " ") continue;
      if (this.fg[i] !== last) {
        last = this.fg[i];
        ctx.fillStyle = last;
      }
      const x = (i % cols) * cellW + cellW / 2;
      const y = Math.floor(i / cols) * cellH + cellH / 2 + 1;
      // Block and line characters are drawn as shapes so they join up without gaps.
      if (!drawShape(ctx, c, x - cellW / 2, y - 1 - cellH / 2, cellW, cellH)) ctx.fillText(c, x, y);
    }
  }
}

/** Draws block/shade characters as rectangles so they tile perfectly. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  c: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  switch (c) {
    case "█":
      ctx.fillRect(x, y, w, h);
      return true;
    case "▄":
      ctx.fillRect(x, y + h / 2, w, h / 2);
      return true;
    case "▀":
      ctx.fillRect(x, y, w, h / 2);
      return true;
    case "─":
      ctx.fillRect(x, y + Math.floor(h / 2), w, 1);
      return true;
    case "│":
      ctx.fillRect(x + Math.floor(w / 2), y, 1, h);
      return true;
    case "┌":
      ctx.fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), Math.ceil(w / 2), 1);
      ctx.fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), 1, Math.ceil(h / 2));
      return true;
    case "┐":
      ctx.fillRect(x, y + Math.floor(h / 2), Math.floor(w / 2) + 1, 1);
      ctx.fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), 1, Math.ceil(h / 2));
      return true;
    case "└":
      ctx.fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), Math.ceil(w / 2), 1);
      ctx.fillRect(x + Math.floor(w / 2), y, 1, Math.floor(h / 2) + 1);
      return true;
    case "┘":
      ctx.fillRect(x, y + Math.floor(h / 2), Math.floor(w / 2) + 1, 1);
      ctx.fillRect(x + Math.floor(w / 2), y, 1, Math.floor(h / 2) + 1);
      return true;
    case "░":
    case "▒":
    case "▓": {
      const a = c === "░" ? 0.25 : c === "▒" ? 0.5 : 0.75;
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      return true;
    }
    default:
      return false;
  }
}
