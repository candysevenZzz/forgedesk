import { invoke } from "@tauri-apps/api/core";
import type { RuntimeMode } from "./types";

type RuntimeSettings = { mode: RuntimeMode };

const browserStorageKey = "forgedesk-runtime-settings-v1";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    const serialized = isTauriRuntime()
      ? await invoke<string>("load_runtime_settings")
      : window.localStorage.getItem(browserStorageKey) ?? "{}";
    const parsed = JSON.parse(serialized) as Partial<RuntimeSettings>;
    return { mode: parsed.mode === "connected" ? "connected" : "local" };
  } catch {
    return { mode: "local" };
  }
}

export async function saveRuntimeSettings(settings: RuntimeSettings) {
  const serialized = JSON.stringify(settings);
  if (isTauriRuntime()) {
    await invoke("save_runtime_settings", { settingsJson: serialized });
    return;
  }
  window.localStorage.setItem(browserStorageKey, serialized);
}
