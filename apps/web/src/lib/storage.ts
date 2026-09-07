import type { GameState } from "@likagame/contracts";

export type DemoStage = "intro" | "map" | "story" | "math_intro" | "encounter" | "input_smoke" | "relay_room" | "grid_room" | "epilogue";
export type AdventureRoom = 1 | 2 | 3;

export type RelayRoomProgress = {
  step_size: number;
  repeat_count: number;
  attempts: number;
  hint_level: 0 | 1 | 2 | 3;
  complete: boolean;
};

export type GridRoomProgress = {
  rows: number;
  columns: number;
  origin_row: number;
  origin_column: number;
  attempts: number;
  hint_level: 0 | 1 | 2 | 3;
  complete: boolean;
};

export type DemoSnapshot = {
  schema_version: 1;
  content_version: string;
  saved_at: string;
  stage: DemoStage;
  adventure_room: AdventureRoom;
  game_state: GameState;
  story_line_index: number;
  math_intro_beat: number;
  numeric_draft: string;
  numeric_complete: boolean;
  relay_room: RelayRoomProgress;
  grid_room: GridRoomProgress;
};

export type TelemetryRecord = {
  schema_version: 1;
  sequence: number;
  event_name: string;
  occurred_at: string;
  run_id: string;
  content_version: string;
  payload: Record<string, unknown>;
};

const DB_NAME = "likagame_playable";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshot";
const TELEMETRY_STORE = "telemetry";
const FALLBACK_KEY = "likagame_demo_snapshot_v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE);
      if (!database.objectStoreNames.contains(TELEMETRY_STORE)) {
        database.createObjectStore(TELEMETRY_STORE, { keyPath: "sequence" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function looksLikeSnapshot(value: unknown): value is DemoSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<DemoSnapshot>;
  return (
    snapshot.schema_version === 1 &&
    typeof snapshot.content_version === "string" &&
    typeof snapshot.stage === "string" &&
    Boolean(snapshot.game_state?.encounter?.candidate?.placements) &&
    [1, 2, 3].includes(snapshot.adventure_room ?? 0) &&
    Boolean(snapshot.relay_room) &&
    Boolean(snapshot.grid_room)
  );
}

export async function loadSnapshot(expectedContentVersion: string): Promise<DemoSnapshot | null> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const value = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get("active"));
    database.close();
    if (!looksLikeSnapshot(value) || value.content_version !== expectedContentVersion) return null;
    return value;
  } catch {
    const fallback = localStorage.getItem(FALLBACK_KEY);
    if (!fallback) return null;
    try {
      const value: unknown = JSON.parse(fallback);
      return looksLikeSnapshot(value) && value.content_version === expectedContentVersion ? value : null;
    } catch {
      return null;
    }
  }
}

export async function saveSnapshot(snapshot: DemoSnapshot): Promise<"indexed_db" | "local_storage"> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).put(snapshot, "active");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Snapshot transaction failed"));
    });
    database.close();
    return "indexed_db";
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    return "local_storage";
  }
}

export async function appendTelemetry(record: TelemetryRecord): Promise<void> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(TELEMETRY_STORE, "readwrite");
    transaction.objectStore(TELEMETRY_STORE).put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Telemetry transaction failed"));
    });
    database.close();
  } catch {
    const key = `${FALLBACK_KEY}_telemetry`;
    const records = JSON.parse(localStorage.getItem(key) ?? "[]") as TelemetryRecord[];
    records.push(record);
    localStorage.setItem(key, JSON.stringify(records.slice(-500)));
  }
}

export async function readTelemetry(): Promise<TelemetryRecord[]> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(TELEMETRY_STORE, "readonly");
    const values = await requestResult(transaction.objectStore(TELEMETRY_STORE).getAll());
    database.close();
    return values as TelemetryRecord[];
  } catch {
    return JSON.parse(localStorage.getItem(`${FALLBACK_KEY}_telemetry`) ?? "[]") as TelemetryRecord[];
  }
}

export async function clearDemoStorage(): Promise<void> {
  localStorage.removeItem(FALLBACK_KEY);
  localStorage.removeItem(`${FALLBACK_KEY}_telemetry`);
  try {
    const database = await openDatabase();
    const transaction = database.transaction([SNAPSHOT_STORE, TELEMETRY_STORE], "readwrite");
    transaction.objectStore(SNAPSHOT_STORE).clear();
    transaction.objectStore(TELEMETRY_STORE).clear();
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
    database.close();
  } catch {
    // Storage can be unavailable in hardened webviews; the fresh in-memory run still works.
  }
}
