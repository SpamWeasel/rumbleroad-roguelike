import { contextBridge, ipcRenderer } from "electron";
import { IPC, type RumbleBridge } from "../shared/bridge";

const smokeArg = process.argv.find((arg) => arg.startsWith("--smoke-scene="));

const bridge: RumbleBridge = {
  readSave: () => ipcRenderer.invoke(IPC.readSave),
  writeSave: (data) => ipcRenderer.invoke(IPC.writeSave, data),
  deleteSave: () => ipcRenderer.invoke(IPC.deleteSave),
  toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
  quit: () => ipcRenderer.send(IPC.quit),
  signalReady: (report) => ipcRenderer.send(IPC.rendererReady, report),
  smokeScene: smokeArg ? smokeArg.slice("--smoke-scene=".length) : null,
};

contextBridge.exposeInMainWorld("rumblerow", bridge);
