export const HISTORY_KEY = "quick-qr-scan:history:v1";
export const HISTORY_LIMIT = 20;

export interface ScanHistoryItem {
  value: string;
  firstScannedAt: string;
  lastScannedAt: string;
  scanCount: number;
}

export interface HistoryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStore(initial: Record<string, string> = {}): HistoryStore {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

export function addScanToHistory(
  history: ScanHistoryItem[],
  value: string,
  scannedAt: Date = new Date(),
  limit = HISTORY_LIMIT,
): ScanHistoryItem[] {
  const isoTime = scannedAt.toISOString();
  const existing = history.find((item) => item.value === value);
  const rest = history.filter((item) => item.value !== value);

  const nextItem: ScanHistoryItem = existing
    ? {
        ...existing,
        lastScannedAt: isoTime,
        scanCount: existing.scanCount + 1,
      }
    : {
        value,
        firstScannedAt: isoTime,
        lastScannedAt: isoTime,
        scanCount: 1,
      };

  return [nextItem, ...rest].slice(0, limit);
}

export function deleteScanFromHistory(history: ScanHistoryItem[], value: string): ScanHistoryItem[] {
  return history.filter((item) => item.value !== value);
}

export function readStoredHistory(store: HistoryStore, key = HISTORY_KEY): ScanHistoryItem[] {
  const raw = store.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isHistoryItem).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeStoredHistory(store: HistoryStore, history: ScanHistoryItem[], key = HISTORY_KEY): void {
  store.setItem(key, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

export function saveScanToStore(
  store: HistoryStore,
  value: string,
  scannedAt: Date = new Date(),
  key = HISTORY_KEY,
): ScanHistoryItem[] {
  const nextHistory = addScanToHistory(readStoredHistory(store, key), value, scannedAt);
  writeStoredHistory(store, nextHistory, key);
  return nextHistory;
}

export function clearStoredHistory(store: HistoryStore, key = HISTORY_KEY): void {
  store.removeItem(key);
}

function isHistoryItem(value: unknown): value is ScanHistoryItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.value === "string" &&
    typeof item.firstScannedAt === "string" &&
    typeof item.lastScannedAt === "string" &&
    typeof item.scanCount === "number"
  );
}
