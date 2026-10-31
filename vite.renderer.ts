import { readFileSync } from "node:fs";
import type { Plugin, PluginOption } from "vite";

/** Renderer settings shared by the desktop build and the browser-only preview. */
export const RENDERER_ROOT = "src/renderer";
export const RENDERER_PORT = 5191;

/** The packaged game may only load its own files and never reaches the internet. */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function productionCsp(): Plugin {
  return {
    name: "rumblerow-production-csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
      ),
  };
}

/** Makes the version in package.json available to the game as __APP_VERSION__. */
function appVersion(): Plugin {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  return {
    name: "rumblerow-app-version",
    config: () => ({ define: { __APP_VERSION__: JSON.stringify(version) } }),
  };
}

export function rendererPlugins(): PluginOption[] {
  return [productionCsp(), appVersion()];
}
