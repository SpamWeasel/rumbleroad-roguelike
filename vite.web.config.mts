// The game in a normal browser, without Electron (`pnpm dev:web`). Saves use browser storage there.
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { RENDERER_PORT, RENDERER_ROOT, rendererPlugins } from "./vite.renderer";

export default defineConfig({
  root: resolve(import.meta.dirname, RENDERER_ROOT),
  plugins: rendererPlugins(),
  server: { port: RENDERER_PORT, strictPort: true },
});
