import type { HistoryStore } from "../../../entities/scan-history";

export const AUTO_OPEN_LINKS_KEY = "quick-qr-scan:auto-open-links:v1";

export function readStoredBoolean(store: HistoryStore, key: string): boolean {
  try {
    return store.getItem(key) === "true";
  } catch {
    return false;
  }
}
