export type WelcomePayload = {
  title: string;
  subtitle: string;
  platforms: string[];
  tags: string[];
  ideas: {
    title: string;
    summary: string;
    fitFor: string;
  }[];
  checklist: string[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8088";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type TranslationProvider = "baidu" | "youdao" | "google" | "alibaba";

export type TranslationCredentials = {
  appId: string;
  appKey: string;
  appSecret: string;
};

export async function translateText(request: {
  provider: TranslationProvider;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  credentials: TranslationCredentials;
}): Promise<{ provider: string; translatedText: string }> {
  const response = await fetch(`${API_BASE_URL}/api/translation/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
    throw new Error(payload?.detail ?? payload?.message ?? `翻译请求失败：${response.status}`);
  }

  return response.json() as Promise<{ provider: string; translatedText: string }>;
}

export async function syncWorkNotes(archive: WorkNotesArchive): Promise<{ archive: WorkNotesArchive; syncedAt: string }> {
  const response = await fetch(`${API_BASE_URL}/api/work-notes/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archive }),
  });

  if (!response.ok) throw new Error(`笔记同步失败：${response.status}`);
  return response.json() as Promise<{ archive: WorkNotesArchive; syncedAt: string }>;
}

export function fetchWelcome(): Promise<WelcomePayload> {
  return request<WelcomePayload>("/api/welcome");
}

export function fetchHealth(): Promise<{ status: string; checkedAt: string }> {
  return request<{ status: string; checkedAt: string }>("/api/health");
}
import type { WorkNotesArchive } from "./work-notes-storage";
