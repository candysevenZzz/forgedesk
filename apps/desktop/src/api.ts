import type { WorkNotesArchive } from "./work-notes-storage";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8080" : window.location.origin);
let accessToken = "";
type ApiResult<T> = { code: string; message: string; data: T; traceId: string };

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  avatarUrl: string;
};

export type AuthResult = { token: string; user: AuthUser };

export function setAccessToken(token: string) {
  accessToken = token;
}

export function chatWebSocketUrl(ticket: string) {
  if (!ticket) {
    throw new Error("聊天连接凭证无效");
  }
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/chat";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}
export function assetUrl(path: string) {
  return path ? `${API_BASE_URL}${path}` : "";
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  return unwrap<T>(response);
}

async function jsonRequest<T>(path: string, init?: RequestInit, requiresAuthentication = false): Promise<T> {
  const headers = new Headers(init?.headers);
  if (requiresAuthentication) {
    if (!accessToken) {
      throw new Error("请先登录后再使用服务端能力");
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  return unwrap<T>(response);
}

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!response.ok || !payload || payload.code !== "OK") {
    const trace = payload?.traceId ? `（追踪号 ${payload.traceId}）` : "";
    throw new Error(`${payload?.message || `服务请求失败：${response.status}`}${trace}`);
  }
  return payload.data;
}

export function registerAccount(request: {
  username: string;
  displayName: string;
  password: string;
  bootstrapToken: string;
}): Promise<AuthResult> {
  return jsonRequest<AuthResult>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function loginAccount(request: { username: string; password: string }): Promise<AuthResult> {
  return jsonRequest<AuthResult>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return jsonRequest<AuthUser>("/api/auth/me", undefined, true);
}

export async function logoutAccount() {
  if (!accessToken) {
    return;
  }
  await jsonRequest<void>("/api/auth/logout", { method: "POST" }, true);
}
export function updateProfile(displayName: string): Promise<AuthUser> {
  return jsonRequest<AuthUser>(
    "/api/auth/profile",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) },
    true,
  );
}
export function updatePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  return jsonRequest<AuthUser>(
    "/api/auth/password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    true,
  );
}
export function updateAvatar(dataUrl: string): Promise<AuthUser> {
  return jsonRequest<AuthUser>(
    "/api/auth/avatar",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) },
    true,
  );
}

export type TranslationProvider = "baidu" | "youdao" | "google" | "alibaba";

export type TranslationConfigurationInput = {
  appId: string;
  appKey: string;
  appSecret: string;
};

export type TranslationConfigurationStatus = {
  provider: TranslationProvider;
  configured: boolean;
  updatedAt: string;
};

export async function translateText(request: {
  provider: TranslationProvider;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<{ provider: string; translatedText: string }> {
  return jsonRequest<{ provider: string; translatedText: string }>(
    "/api/translation/translate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    true,
  );
}

export function getTranslationConfiguration(provider: TranslationProvider): Promise<TranslationConfigurationStatus> {
  return jsonRequest<TranslationConfigurationStatus>(`/api/translation/configuration/${provider}`, undefined, true);
}

export function saveTranslationConfiguration(
  provider: TranslationProvider,
  configuration: TranslationConfigurationInput,
): Promise<TranslationConfigurationStatus> {
  return jsonRequest<TranslationConfigurationStatus>(
    `/api/translation/configuration/${provider}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configuration),
    },
    true,
  );
}

export async function syncWorkNotes(
  archive: WorkNotesArchive,
): Promise<{ archive: WorkNotesArchive; syncedAt: string }> {
  return jsonRequest<{ archive: WorkNotesArchive; syncedAt: string }>(
    "/api/work-notes/sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive }),
    },
    true,
  );
}

export type AdminOverview = {
  startedAt: string;
  uptimeSeconds: number;
  userCount: number;
  activeSessionCount: number;
  workNotesArchiveCount: number;
  translationConfigurationCount: number;
};

export type AdminUserRecord = AuthUser;
export type AdminStorageRecord = { kind: string; userId: string; sizeBytes: number; updatedAt: string };
export type AdminSystemStatus = {
  cpu: { availableProcessors: number; processLoadPercent: number; systemLoadPercent: number };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number };
  disk: { path: string; totalBytes: number; usedBytes: number; usableBytes: number };
  totalUserStorageBytes: number;
  userStorage: { userId: string; fileCount: number; sizeBytes: number; updatedAt: string }[];
};

export type AdminChatOverview = {
  conversationCount: number;
  groupCount: number;
  directConversationCount: number;
  messageCount: number;
  todayMessageCount: number;
};

export type AdminConversationRecord = {
  id: string;
  title: string;
  memberCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  ciphertextBytes: number;
  lastMessageAt: string;
};

export type AdminChatMessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertextBytes: number;
  createdAt: string;
};

export function fetchAdminOverview(): Promise<AdminOverview> {
  return jsonRequest<AdminOverview>("/api/admin/overview", undefined, true);
}

export function fetchAdminUsers(): Promise<AdminUserRecord[]> {
  return jsonRequest<AdminUserRecord[]>("/api/admin/users", undefined, true);
}

export function fetchAdminRecords(): Promise<AdminStorageRecord[]> {
  return jsonRequest<AdminStorageRecord[]>("/api/admin/records", undefined, true);
}

export function fetchAdminSystem(): Promise<AdminSystemStatus> {
  return jsonRequest<AdminSystemStatus>("/api/admin/system", undefined, true);
}

export function fetchAdminChatOverview(): Promise<AdminChatOverview> {
  return jsonRequest<AdminChatOverview>("/api/admin/chat/overview", undefined, true);
}

export function fetchAdminChatConversations(): Promise<AdminConversationRecord[]> {
  return jsonRequest<AdminConversationRecord[]>("/api/admin/chat/conversations", undefined, true);
}

export function fetchAdminChatMessages(): Promise<AdminChatMessageRecord[]> {
  return jsonRequest<AdminChatMessageRecord[]>("/api/admin/chat/messages", undefined, true);
}

export function fetchHealth(): Promise<{ status: string; checkedAt: string }> {
  return request<{ status: string; checkedAt: string }>("/api/health");
}

export type ChatUser = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "USER";
  createdAt: string;
  avatarUrl: string;
  online: boolean;
};

export type ChatConversation = {
  id: string;
  title: string;
  announcement: string;
  participantIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EncryptedChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  keyVersion: number;
  createdAt: string;
};

export type ChatMessagePage = {
  messages: EncryptedChatMessage[];
  nextAfter: string;
  previousBefore: string;
  hasMoreAfter: boolean;
  hasMoreBefore: boolean;
};

export function fetchChatUsers(): Promise<ChatUser[]> {
  return jsonRequest<ChatUser[]>("/api/chat/users", undefined, true);
}

export function createChatSocketTicket(): Promise<{ ticket: string }> {
  return jsonRequest<{ ticket: string }>("/api/chat/socket-ticket", { method: "POST" }, true);
}

/** Server X25519 public key used to establish an ephemeral chat transport session. */
export function fetchChatTransportKey(): Promise<{ publicKey: string }> {
  return jsonRequest<{ publicKey: string }>("/api/chat/transport-key", undefined, true);
}

export function fetchChatConversations(): Promise<ChatConversation[]> {
  return jsonRequest<ChatConversation[]>("/api/chat/conversations", undefined, true);
}

export function fetchChatUnreadCounts(cursors: Record<string, string>): Promise<Record<string, number>> {
  return jsonRequest<Record<string, number>>(
    "/api/chat/conversations/unread-counts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursors }),
    },
    true,
  );
}

export function createChatConversation(request: {
  title: string;
  participantIds: string[];
}): Promise<ChatConversation> {
  return jsonRequest<ChatConversation>(
    "/api/chat/conversations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    true,
  );
}

/** 永久删除由当前用户创建的共享会话及其服务端密文记录。 */
export function deleteChatConversation(conversationId: string): Promise<ChatConversation> {
  return jsonRequest<ChatConversation>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
    true,
  );
}

/** 更新群资料，仅群主可修改群名称和公告。 */
export function updateChatConversationProfile(
  conversationId: string,
  request: { title: string; announcement: string },
): Promise<ChatConversation> {
  return jsonRequest<ChatConversation>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    true,
  );
}

export function fetchChatMessages(
  conversationId: string,
  clientPublicKey: string,
  cursor: { after?: string; before?: string } = {},
): Promise<ChatMessagePage> {
  const query = new URLSearchParams();
  query.set("clientPublicKey", clientPublicKey);
  if (cursor.after) {
    query.set("after", cursor.after);
  }
  if (cursor.before) {
    query.set("before", cursor.before);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return jsonRequest<ChatMessagePage>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    undefined,
    true,
  );
}

export function sendChatMessage(
  conversationId: string,
  message: Pick<EncryptedChatMessage, "ciphertext" | "nonce"> & { clientPublicKey: string },
): Promise<EncryptedChatMessage> {
  return jsonRequest<EncryptedChatMessage>(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    },
    true,
  );
}
