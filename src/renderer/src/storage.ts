/** Saves go to a file through Electron, or to browser storage in the web preview. */
const KEY = "rumblerow-save";

export async function readSave(): Promise<string | null> {
  if (window.rumblerow) return window.rumblerow.readSave();
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeSave(data: string): Promise<void> {
  if (window.rumblerow) return window.rumblerow.writeSave(data);
  try {
    localStorage.setItem(KEY, data);
  } catch {
    // Browser storage unavailable: the game still plays, it just won't be saved.
  }
}

export async function deleteSave(): Promise<void> {
  if (window.rumblerow) return window.rumblerow.deleteSave();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to delete.
  }
}
