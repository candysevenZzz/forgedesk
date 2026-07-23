import { invoke } from "@tauri-apps/api/core";

const browserStorageKey = "forgedesk-session-token-v1";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadSessionToken(): Promise<string> {
  try {
    return isTauriRuntime()
      ? await invoke<string>("load_session_token")
      : (window.sessionStorage.getItem(browserStorageKey) ?? "");
  } catch {
    return "";
  }
}

export async function saveSessionToken(token: string) {
  if (isTauriRuntime()) {
    await invoke("save_session_token", { token });
    return;
  }
  window.sessionStorage.setItem(browserStorageKey, token);
}
