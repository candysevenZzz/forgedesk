import { invoke } from "@tauri-apps/api/core";

export type WorkNoteKind = "memo" | "todo" | "card";

export type WorkNote = {
  id: string;
  kind: WorkNoteKind;
  title: string;
  content: string;
  completed: boolean;
  pinned: boolean;
  x: number;
  y: number;
  zIndex: number;
  updatedAt: string;
};

export type WorkNotesArchive = {
  version: 2;
  days: Record<string, WorkNote[]>;
  tombstones: Record<string, string>;
};

const browserStorageKey = "forgedesk-work-notes-v1";

export function todayWorkNotesDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function parseArchive(serialized: string): WorkNotesArchive {
  const parsed: unknown = JSON.parse(serialized);
  if (Array.isArray(parsed)) return { version: 2, days: { [todayWorkNotesDate()]: parsed as WorkNote[] }, tombstones: {} };
  if (!parsed || typeof parsed !== "object" || !("days" in parsed) || !parsed.days || typeof parsed.days !== "object") {
    return { version: 2, days: {}, tombstones: {} };
  }
  const days = Object.fromEntries(
    Object.entries(parsed.days as Record<string, unknown>)
      .filter(([date, notes]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(notes))
      .map(([date, notes]) => [date, notes as WorkNote[]]),
  );
  const tombstones = "tombstones" in parsed && parsed.tombstones && typeof parsed.tombstones === "object"
    ? Object.fromEntries(Object.entries(parsed.tombstones as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string>
    : {};
  return { version: 2, days, tombstones };
}

export async function loadWorkNotes(): Promise<WorkNotesArchive> {
  try {
    if (isTauriRuntime()) {
      const saved = await invoke<string>("load_work_notes");
      return parseArchive(saved);
    }
    return parseArchive(window.localStorage.getItem(browserStorageKey) ?? "[]");
  } catch {
    return { version: 2, days: {}, tombstones: {} };
  }
}

export async function saveWorkNotes(archive: WorkNotesArchive) {
  const serialized = JSON.stringify(archive);
  if (isTauriRuntime()) {
    await invoke("save_work_notes", { notesJson: serialized });
    return;
  }
  window.localStorage.setItem(browserStorageKey, serialized);
}
