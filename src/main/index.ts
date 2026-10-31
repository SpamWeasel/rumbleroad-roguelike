import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
} from "electron";
import { IPC } from "../shared/bridge";

// Development runs keep their own saves so testing never touches a player's game.
if (!app.isPackaged) app.setPath("userData", join(app.getPath("appData"), "RumbleRow Dev"));

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const rendererFile = join(__dirname, "../renderer/index.html");
const trustedPagePrefix = devServerUrl ?? pathToFileURL(rendererFile).href;
const savesDir = join(app.getPath("userData"), "Saves");
const saveFile = join(savesDir, "game.json");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(start);
}

function start(): void {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  registerIpc();
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#000000",
    title: "Rumble Row",
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(trustedPagePrefix)) event.preventDefault();
  });
  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(rendererFile);
}

function assertTrusted(event: IpcMainInvokeEvent | IpcMainEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!url.startsWith(trustedPagePrefix)) throw new Error("Untrusted sender.");
}

function registerIpc(): void {
  ipcMain.handle(IPC.readSave, async (event) => {
    assertTrusted(event);
    try {
      return await readFile(saveFile, "utf8");
    } catch {
      return null;
    }
  });
  ipcMain.handle(IPC.writeSave, async (event, data: unknown) => {
    assertTrusted(event);
    if (typeof data !== "string") throw new Error("Bad save.");
    await mkdir(savesDir, { recursive: true });
    // Write to a temporary file first so a crash mid-write never leaves a broken save.
    await writeFile(`${saveFile}.tmp`, data);
    await rename(`${saveFile}.tmp`, saveFile);
  });
  ipcMain.handle(IPC.deleteSave, async (event) => {
    assertTrusted(event);
    await rm(saveFile, { force: true });
  });
  ipcMain.handle(IPC.toggleFullscreen, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setFullScreen(!window.isFullScreen());
  });
  ipcMain.on(IPC.quit, (event) => {
    assertTrusted(event);
    app.quit();
  });
}
