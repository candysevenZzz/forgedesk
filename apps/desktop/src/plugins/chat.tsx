import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  CircleUserRound,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  MessagesSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import {
  addChatGroupKeyEnvelope,
  addChatMessageKeyEnvelope,
  assetUrl,
  chatWebSocketUrl,
  createChatConversation,
  createChatSocketTicket,
  deleteChatConversation,
  fetchChatGroupKey,
  fetchChatConversations,
  fetchChatMessages,
  fetchChatUnreadCounts,
  fetchChatUsers,
  fetchUserChatDevices,
  initializeChatGroupKey,
  registerChatDevice,
  sendChatMessage,
  type ChatConversation,
  type ChatDeviceKey,
  type ChatUser,
  type EncryptedChatMessage,
} from "../api";
import {
  createGroupKeyEnvelope,
  createGroupKeyPayload,
  createMessageKeyEnvelope,
  decryptGroupKey,
  decryptMessage,
  encryptGroupMessage,
  encryptMessage,
  ensureDeviceIdentity,
  isHttpPlaintextCompatibilityMode,
  requiresHttpPlaintextCompatibility,
  type DeviceIdentity,
} from "../chat-crypto";
import type { PluginContext, PluginDefinition } from "../types";

type ChatEvent =
  | { type: "ready"; onlineUserIds?: string[] }
  | { type: "presence-changed"; userId: string; online: boolean }
  | { type: "conversation-changed"; conversationId: string; createdAt?: string }
  | { type: "message-created"; conversationId: string; senderId: string; createdAt: string }
  | { type: "conversation-deleted"; conversationId: string }
  | { type: "device-changed"; userId: string }
  | { type: "signal" };

type RenderedMessage = EncryptedChatMessage & { text: string | null; unreadable: boolean };

type ResolvedGroupKey = { keyVersion: number; rawKey: ArrayBuffer; deviceIds: Set<string> };

type ChatReadCursors = Record<string, string>;

const READ_CURSORS_STORAGE_PREFIX = "forgedesk-chat-read-cursors-v1:";

function loadReadCursors(userId: string): ChatReadCursors {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`${READ_CURSORS_STORAGE_PREFIX}${userId}`) ?? "{}",
    ) as unknown;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

function saveReadCursors(userId: string, cursors: ChatReadCursors) {
  window.localStorage.setItem(`${READ_CURSORS_STORAGE_PREFIX}${userId}`, JSON.stringify(cursors));
}

function unreadLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

function sortConversations(conversations: ChatConversation[]) {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergeMessages(current: RenderedMessage[], incoming: RenderedMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function renderMessages(
  messages: EncryptedChatMessage[],
  identity: DeviceIdentity,
  rawGroupKey?: ArrayBuffer | null,
) {
  return Promise.all(
    messages.map(async (message) => {
      try {
        const text = await decryptMessage(message, identity, rawGroupKey);
        return { ...message, text, unreadable: text === null };
      } catch {
        return { ...message, text: null, unreadable: true };
      }
    }),
  );
}

function userInitials(user: Pick<ChatUser, "displayName" | "username">) {
  return (user.displayName || user.username).trim().slice(0, 2).toUpperCase();
}

function userName(user: ChatUser | undefined, fallback = "未知成员") {
  return user?.displayName || user?.username || fallback;
}

function ChatAvatar({ user, className = "" }: { user: ChatUser; className?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const source = user.avatarUrl ? assetUrl(user.avatarUrl) : "";

  useEffect(() => {
    setImageFailed(false);
  }, [source]);

  return (
    <span className={`chat-user-avatar ${className}`.trim()} aria-hidden="true">
      {source && !imageFailed ? <img src={source} alt="" onError={() => setImageFailed(true)} /> : userInitials(user)}
    </span>
  );
}

function ConversationAvatar({
  conversation,
  users,
  currentUserId,
}: {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: string;
}) {
  const otherUserId = conversation.participantIds.find((userId) => userId !== currentUserId);
  const otherUser = otherUserId ? users.find((user) => user.id === otherUserId) : undefined;
  if (conversation.participantIds.length === 2 && otherUser) {
    return <ChatAvatar user={otherUser} className="chat-conversation-avatar" />;
  }
  return (
    <span className="chat-conversation-icon" aria-hidden="true">
      {conversation.participantIds.length > 2 ? <UsersRound size={17} /> : <MessageSquareText size={17} />}
    </span>
  );
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function ConversationTitle({
  conversation,
  users,
  currentUserId,
  plaintextCompatibilityMode = false,
}: {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: string;
  plaintextCompatibilityMode?: boolean;
}) {
  const otherMembers = conversation.participantIds.filter((item) => item !== currentUserId);
  const isGroup = conversation.participantIds.length > 2;
  const fallback = otherMembers
    .map((item) =>
      userName(
        users.find((user) => user.id === item),
        "成员",
      ),
    )
    .join("、");
  return (
    <>{conversation.title || (isGroup ? "群聊" : fallback || (plaintextCompatibilityMode ? "聊天" : "加密聊天"))}</>
  );
}

function ChatUnavailable({ context }: { context: PluginContext }) {
  const waitingForLogin = context.runtimeMode === "connected" && !context.auth;
  return (
    <section className="chat-unavailable">
      <div className="chat-unavailable-icon">
        <LockKeyhole size={23} aria-hidden="true" />
      </div>
      <div>
        <h2>{waitingForLogin ? "登录后可使用加密聊天" : "加密聊天需要服务连接"}</h2>
        <p>
          {waitingForLogin
            ? "消息密钥仅保存在当前设备，登录后会登记此设备的公开密钥。"
            : "切换到服务运行模式后，可使用端到端加密消息、群聊与多设备密文同步。"}
        </p>
      </div>
    </section>
  );
}

function CreateConversationDialog({
  users,
  onClose,
  onCreate,
  creating,
  error,
  plaintextCompatibilityMode,
}: {
  users: ChatUser[];
  onClose: () => void;
  onCreate: (title: string, participantIds: string[]) => void;
  creating: boolean;
  error: string;
  plaintextCompatibilityMode: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const group = selected.length > 1;

  function toggleUser(userId: string) {
    setSelected((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length || creating) {
      return;
    }
    const defaultTitle = group ? "群聊" : userName(users.find((user) => user.id === selected[0]));
    onCreate(title.trim() || defaultTitle, selected);
  }

  return (
    <div className="chat-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="chat-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>
              {group
                ? plaintextCompatibilityMode
                  ? "创建群聊"
                  : "创建加密群聊"
                : plaintextCompatibilityMode
                  ? "发起聊天"
                  : "发起加密聊天"}
            </h2>
            <p>
              {plaintextCompatibilityMode
                ? "当前通过 HTTP 运行，消息会以明文兼容方式同步。"
                : "消息正文会在发送设备加密，再同步到成员设备。"}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <label className="chat-dialog-title">
          <span>{group ? "群聊名称" : "聊天名称"}</span>
          <input
            className="text-field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={group ? "未填写时使用“群聊”" : "未填写时使用对方名称"}
          />
        </label>
        <div className="chat-member-picker" role="list" aria-label="选择聊天成员">
          {users.map((user) => {
            const checked = selected.includes(user.id);
            return (
              <label className={checked ? "selected" : ""} key={user.id}>
                <input type="checkbox" checked={checked} onChange={() => toggleUser(user.id)} />
                <ChatAvatar user={user} />
                <span className="chat-member-copy">
                  <strong>{userName(user)}</strong>
                  <small>{user.online ? "在线" : "离线"}</small>
                </span>
                <i className={user.online ? "online" : ""} aria-label={user.online ? "在线" : "离线"} />
              </label>
            );
          })}
          {!users.length ? <p className="chat-member-empty">暂无其他已注册用户，无法创建聊天。</p> : null}
        </div>
        {error ? <p className="chat-dialog-error">{error}</p> : null}
        <footer>
          <span>{selected.length ? `已选择 ${selected.length} 位成员` : "选择至少一位成员"}</span>
          <button className="chat-primary-button" type="submit" disabled={!selected.length || creating}>
            {creating ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : (
              <UsersRound size={15} aria-hidden="true" />
            )}
            创建
          </button>
        </footer>
      </form>
    </div>
  );
}

function DeleteConversationDialog({
  conversation,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  conversation: ChatConversation;
  deleting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="chat-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="chat-dialog chat-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-conversation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="delete-conversation-title">删除会话</h2>
            <p>这会永久删除所有成员可见的会话记录。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <p className="chat-confirm-copy">
          将删除“{conversation.title || "未命名会话"}”及其中全部服务端消息记录。此操作无法恢复。
        </p>
        {error ? <p className="chat-dialog-error">{error}</p> : null}
        <footer>
          <button className="chat-secondary-button" type="button" onClick={onClose} disabled={deleting}>
            取消
          </button>
          <button className="chat-danger-button" type="button" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden="true" />
            )}
            删除会话
          </button>
        </footer>
      </section>
    </div>
  );
}

function ChatPlugin({ context }: { context: PluginContext }) {
  const enabled = context.runtimeMode === "connected" && context.serviceOnline && Boolean(context.auth);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<RenderedMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("正在准备设备密钥...");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const reconnectRef = useRef<number | null>(null);
  const conversationsRef = useRef<ChatConversation[]>([]);
  const activeConversationIdRef = useRef("");
  const messagesRef = useRef<RenderedMessage[]>([]);
  const messagesConversationRef = useRef("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const messageNodesRef = useRef(new Map<string, HTMLElement>());
  const readCursorsRef = useRef<ChatReadCursors>({});
  const pendingUnreadJumpRef = useRef("");
  const scrollToLatestRef = useRef("");
  const automaticMessageScrollRef = useRef(false);
  const conversationsRequestRef = useRef<Promise<void> | null>(null);
  const unreadCountsRequestRef = useRef<Promise<void> | null>(null);
  const readCursorRevisionRef = useRef(0);
  const messageRequestsRef = useRef(new Set<string>());
  const unreadableRefreshTimersRef = useRef(new Map<string, number>());
  const deviceKeysCacheRef = useRef(new Map<string, ChatDeviceKey[]>());
  const groupKeysCacheRef = useRef(new Map<string, ResolvedGroupKey>());

  const currentUser = useMemo<ChatUser | undefined>(() => {
    if (!context.auth) {
      return undefined;
    }
    return {
      id: context.auth.id,
      username: context.auth.username,
      displayName: context.auth.displayName,
      role: context.auth.role,
      createdAt: context.auth.createdAt,
      avatarUrl: context.auth.avatarUrl,
      online: true,
    };
  }, [context.auth]);
  const allUsers = useMemo(() => (currentUser ? [currentUser, ...users] : users), [currentUser, users]);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const setupError = !identity && status !== "正在准备设备密钥...";
  const plaintextCompatibilityMode = isHttpPlaintextCompatibilityMode();

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    deviceKeysCacheRef.current.clear();
    groupKeysCacheRef.current.clear();
    readCursorsRef.current = context.auth ? loadReadCursors(context.auth.id) : {};
    readCursorRevisionRef.current += 1;
    activeConversationIdRef.current = "";
    setActiveConversationId("");
    setUnreadCounts({});
    setUnreadAnchorMessageId("");
  }, [context.auth?.id]);

  const saveReadCursor = useCallback(
    (conversationId: string, createdAt: string) => {
      if (!context.auth || !createdAt) {
        return;
      }
      const next = { ...readCursorsRef.current, [conversationId]: createdAt };
      readCursorsRef.current = next;
      readCursorRevisionRef.current += 1;
      saveReadCursors(context.auth.id, next);
      setUnreadCounts((current) => {
        if (!current[conversationId]) {
          return current;
        }
        const updated = { ...current };
        delete updated[conversationId];
        return updated;
      });
    },
    [context.auth],
  );

  const scrollToMessage = useCallback((messageId: string) => {
    window.requestAnimationFrame(() => {
      messageNodesRef.current.get(messageId)?.scrollIntoView({ block: "start" });
    });
  }, []);

  const activateConversation = useCallback((conversationId: string) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
  }, []);

  const refreshConversations = useCallback(async () => {
    if (conversationsRequestRef.current) {
      return conversationsRequestRef.current;
    }
    const request = (async () => {
      const latest = await fetchChatConversations();
      conversationsRef.current = latest;
      setConversations(latest);
      const activeId = activeConversationIdRef.current;
      if (activeId && !latest.some((item) => item.id === activeId)) {
        activateConversation("");
      }
    })();
    conversationsRequestRef.current = request;
    try {
      await request;
    } finally {
      if (conversationsRequestRef.current === request) {
        conversationsRequestRef.current = null;
      }
    }
  }, [activateConversation]);

  const refreshUnreadCounts = useCallback(async () => {
    if (unreadCountsRequestRef.current) {
      return unreadCountsRequestRef.current;
    }
    const request = (async () => {
      // A response calculated from an older cursor must never restore a badge just cleared locally.
      while (true) {
        const revision = readCursorRevisionRef.current;
        const cursors = { ...readCursorsRef.current };
        const counts = await fetchChatUnreadCounts(cursors);
        if (revision === readCursorRevisionRef.current) {
          setUnreadCounts(counts);
          return;
        }
      }
    })();
    unreadCountsRequestRef.current = request;
    try {
      await request;
    } finally {
      if (unreadCountsRequestRef.current === request) {
        unreadCountsRequestRef.current = null;
      }
    }
  }, []);

  const refreshUsers = useCallback(async () => {
    setUsers(await fetchChatUsers());
  }, []);

  const deviceKeysForUsers = useCallback(async (userIds: string[]) => {
    const missingUserIds = [...new Set(userIds)].filter((userId) => !deviceKeysCacheRef.current.has(userId));
    if (missingUserIds.length) {
      const values = await Promise.all(
        missingUserIds.map(async (userId) => [userId, await fetchUserChatDevices(userId)] as const),
      );
      values.forEach(([userId, deviceKeys]) => deviceKeysCacheRef.current.set(userId, deviceKeys));
    }
    return userIds.flatMap((userId) => deviceKeysCacheRef.current.get(userId) ?? []);
  }, []);

  const loadGroupKey = useCallback(async (conversationId: string, currentIdentity: DeviceIdentity) => {
    const cached = groupKeysCacheRef.current.get(conversationId);
    if (cached) {
      return cached;
    }
    const saved = await fetchChatGroupKey(conversationId);
    const rawKey = await decryptGroupKey(saved, currentIdentity);
    if (!rawKey) {
      throw new Error("当前设备尚未获得群会话密钥");
    }
    const resolved = {
      keyVersion: saved.keyVersion,
      rawKey,
      deviceIds: new Set(Object.keys(saved.keyEnvelopes)),
    };
    groupKeysCacheRef.current.set(conversationId, resolved);
    return resolved;
  }, []);

  const groupKeyForMessages = useCallback(
    async (conversationId: string, messages: EncryptedChatMessage[], currentIdentity: DeviceIdentity) => {
      if (!messages.some((message) => !Object.keys(message.keyEnvelopes).length)) {
        return null;
      }
      try {
        return await loadGroupKey(conversationId, currentIdentity);
      } catch {
        return null;
      }
    },
    [loadGroupKey],
  );

  const ensureGroupKey = useCallback(
    async (conversation: ChatConversation, currentIdentity: DeviceIdentity) => {
      try {
        return await loadGroupKey(conversation.id, currentIdentity);
      } catch {
        const deviceKeys = await deviceKeysForUsers(conversation.participantIds);
        const generated = await createGroupKeyPayload(deviceKeys);
        const saved = await initializeChatGroupKey(conversation.id, generated);
        const rawKey =
          saved.keyEnvelopes[currentIdentity.deviceId] === generated.keyEnvelopes[currentIdentity.deviceId]
            ? generated.rawKey
            : await decryptGroupKey(saved, currentIdentity);
        if (!rawKey) {
          throw new Error("当前设备尚未获得群会话密钥");
        }
        const resolved = {
          keyVersion: saved.keyVersion,
          rawKey,
          deviceIds: new Set(Object.keys(saved.keyEnvelopes)),
        };
        groupKeysCacheRef.current.set(conversation.id, resolved);
        return resolved;
      }
    },
    [deviceKeysForUsers, loadGroupKey],
  );

  const ensureGroupKeyCoverage = useCallback(
    async (conversation: ChatConversation, groupKey: ResolvedGroupKey) => {
      const deviceKeys = await deviceKeysForUsers(conversation.participantIds);
      const missingDevices = deviceKeys.filter((device) => !groupKey.deviceIds.has(device.deviceId));
      for (const device of missingDevices) {
        await addChatGroupKeyEnvelope(
          conversation.id,
          device.deviceId,
          await createGroupKeyEnvelope(groupKey.rawKey, device),
        );
        groupKey.deviceIds.add(device.deviceId);
      }
    },
    [deviceKeysForUsers],
  );

  const refreshMessages = useCallback(
    async (conversationId: string, currentIdentity: DeviceIdentity) => {
      if (!conversationId) {
        messagesConversationRef.current = "";
        messagesRef.current = [];
        setMessages([]);
        return;
      }
      messagesConversationRef.current = conversationId;
      messagesRef.current = [];
      setMessages([]);
      setLoading(true);
      try {
        const page = await fetchChatMessages(conversationId);
        const groupKey = await groupKeyForMessages(conversationId, page.messages, currentIdentity);
        const rendered = await renderMessages(page.messages, currentIdentity, groupKey?.rawKey);
        if (messagesConversationRef.current !== conversationId) {
          return;
        }
        messagesRef.current = rendered;
        setMessages(rendered);
        const lastMessage = rendered.at(-1);
        if (conversationId === activeConversationIdRef.current && lastMessage) {
          saveReadCursor(conversationId, lastMessage.createdAt);
        }
        scrollToLatestRef.current = conversationId;
        if (page.hasMoreBefore) {
          setStatus("已加载最近 100 条消息");
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "无法读取聊天记录");
      } finally {
        setLoading(false);
      }
    },
    [groupKeyForMessages, saveReadCursor],
  );

  const refreshNewMessages = useCallback(
    async (conversationId: string, currentIdentity: DeviceIdentity) => {
      if (
        !conversationId ||
        messagesConversationRef.current !== conversationId ||
        messageRequestsRef.current.has(conversationId)
      ) {
        return;
      }
      messageRequestsRef.current.add(conversationId);
      try {
        let after = messagesRef.current.at(-1)?.createdAt ?? "";
        let hasMore = true;
        while (hasMore) {
          const page = await fetchChatMessages(conversationId, { after });
          const groupKey = await groupKeyForMessages(conversationId, page.messages, currentIdentity);
          const rendered = await renderMessages(page.messages, currentIdentity, groupKey?.rawKey);
          if (rendered.length) {
            setMessages((current) => {
              if (messagesConversationRef.current !== conversationId) {
                return current;
              }
              const merged = mergeMessages(current, rendered);
              messagesRef.current = merged;
              return merged;
            });
            if (conversationId === activeConversationIdRef.current) {
              saveReadCursor(conversationId, rendered.at(-1)!.createdAt);
            }
          }
          hasMore = page.hasMoreAfter && Boolean(page.nextAfter) && page.nextAfter !== after;
          after = page.nextAfter;
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "无法同步新增消息");
      } finally {
        messageRequestsRef.current.delete(conversationId);
      }
    },
    [groupKeyForMessages, saveReadCursor],
  );

  const jumpToUnreadMessages = useCallback(
    async (conversationId: string, currentIdentity: DeviceIdentity) => {
      const cursor = readCursorsRef.current[conversationId];
      if (!cursor) {
        return;
      }
      let rendered = messagesRef.current;
      if (!rendered.length || cursor < rendered[0].createdAt) {
        setLoading(true);
        try {
          const page = await fetchChatMessages(conversationId, { after: cursor });
          const groupKey = await groupKeyForMessages(conversationId, page.messages, currentIdentity);
          rendered = await renderMessages(page.messages, currentIdentity, groupKey?.rawKey);
          if (messagesConversationRef.current !== conversationId) {
            return;
          }
          messagesRef.current = rendered;
          setMessages(rendered);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "无法定位未读消息");
          return;
        } finally {
          setLoading(false);
        }
      }
      const firstUnread = rendered.find((message) => message.createdAt > cursor);
      if (!firstUnread) {
        return;
      }
      setUnreadAnchorMessageId(firstUnread.id);
      scrollToMessage(firstUnread.id);
    },
    [groupKeyForMessages, scrollToMessage],
  );

  const scheduleUnreadableMessageRefresh = useCallback(
    (conversationId: string, currentIdentity: DeviceIdentity) => {
      if (unreadableRefreshTimersRef.current.has(conversationId)) {
        return;
      }
      const timer = window.setTimeout(() => {
        unreadableRefreshTimersRef.current.delete(conversationId);
        if (messagesConversationRef.current === conversationId) {
          void refreshMessages(conversationId, currentIdentity);
        }
      }, 400);
      unreadableRefreshTimersRef.current.set(conversationId, timer);
    },
    [refreshMessages],
  );

  const migrateHistoryToKnownDevices = useCallback(
    async (currentIdentity: DeviceIdentity, sourceConversations: ChatConversation[]) => {
      if (!context.auth || !sourceConversations.length || isHttpPlaintextCompatibilityMode()) {
        return 0;
      }
      const devices = await deviceKeysForUsers([context.auth.id]);
      const targetDevices = devices.filter((device) => device.deviceId !== currentIdentity.deviceId);
      if (!targetDevices.length) {
        return 0;
      }
      let migratedCount = 0;
      for (const conversation of sourceConversations) {
        if (conversation.participantIds.length > 2) {
          try {
            const groupKey = await loadGroupKey(conversation.id, currentIdentity);
            const savedGroupKey = await fetchChatGroupKey(conversation.id);
            for (const target of targetDevices) {
              if (savedGroupKey.keyEnvelopes[target.deviceId]) {
                continue;
              }
              await addChatGroupKeyEnvelope(
                conversation.id,
                target.deviceId,
                await createGroupKeyEnvelope(groupKey.rawKey, target),
              );
              migratedCount += 1;
            }
            continue;
          } catch {
            // Existing groups created before group keys continue using per-message envelopes.
          }
        }
        let before = "";
        let hasMoreBefore = true;
        while (hasMoreBefore) {
          const page = await fetchChatMessages(conversation.id, before ? { before } : {});
          for (const message of page.messages) {
            for (const target of targetDevices) {
              if (message.keyEnvelopes[target.deviceId]) {
                continue;
              }
              const keyEnvelope = await createMessageKeyEnvelope(message, currentIdentity, target);
              if (!keyEnvelope) {
                continue;
              }
              await addChatMessageKeyEnvelope(conversation.id, message.id, target.deviceId, keyEnvelope);
              message.keyEnvelopes[target.deviceId] = keyEnvelope;
              migratedCount += 1;
            }
          }
          hasMoreBefore = page.hasMoreBefore && Boolean(page.previousBefore) && page.previousBefore !== before;
          before = page.previousBefore;
        }
      }
      return migratedCount;
    },
    [context.auth, deviceKeysForUsers, loadGroupKey],
  );

  useEffect(() => {
    if (!enabled || !context.auth) {
      setIdentity(null);
      setConversations([]);
      setUsers([]);
      activeConversationIdRef.current = "";
      setActiveConversationId("");
      messagesConversationRef.current = "";
      messagesRef.current = [];
      setMessages([]);
      return;
    }
    let cancelled = false;
    async function initialize() {
      setStatus("正在准备设备密钥...");
      try {
        const nextIdentity = await ensureDeviceIdentity(context.auth!.id);
        await registerChatDevice(nextIdentity.deviceId, nextIdentity.publicKeyJwk);
        const storedReadCursors = loadReadCursors(context.auth!.id);
        readCursorsRef.current = storedReadCursors;
        const [latestUsers, latestConversations, latestUnreadCounts] = await Promise.all([
          fetchChatUsers(),
          fetchChatConversations(),
          fetchChatUnreadCounts(storedReadCursors),
        ]);
        setUsers(latestUsers);
        setConversations(latestConversations);
        setUnreadCounts(latestUnreadCounts);
        if (!activeConversationIdRef.current) {
          activateConversation(latestConversations[0]?.id ?? "");
        }
        const migratedCount = await migrateHistoryToKnownDevices(nextIdentity, latestConversations);
        if (!cancelled) {
          setIdentity(nextIdentity);
          setStatus(
            isHttpPlaintextCompatibilityMode()
              ? "HTTP 明文兼容模式已启用，消息内容不具备端到端加密保护"
              : migratedCount
                ? `已为新设备迁移 ${migratedCount} 条历史消息`
                : "设备已就绪",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "无法准备聊天设备");
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [activateConversation, context.auth, enabled, migrateHistoryToKnownDevices]);

  useEffect(() => {
    if (!identity || !activeConversationId) {
      return;
    }
    void refreshMessages(activeConversationId, identity);
  }, [activeConversationId, identity, refreshMessages]);

  useEffect(() => {
    if (!messages.length || scrollToLatestRef.current !== activeConversationId || !messageListRef.current) {
      return;
    }
    automaticMessageScrollRef.current = true;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    scrollToLatestRef.current = "";
    window.requestAnimationFrame(() => {
      automaticMessageScrollRef.current = false;
    });
  }, [activeConversationId, messages]);

  useEffect(() => {
    const conversationId = pendingUnreadJumpRef.current;
    if (!conversationId || conversationId !== activeConversationId || !identity || !messages.length) {
      return;
    }
    pendingUnreadJumpRef.current = "";
    void jumpToUnreadMessages(conversationId, identity);
  }, [activeConversationId, identity, jumpToUnreadMessages, messages.length]);

  useEffect(() => {
    if (!enabled || !identity) {
      return undefined;
    }
    const connectedIdentity = identity;
    let socket: WebSocket | null = null;
    let attempts = 0;
    let disposed = false;

    function connect() {
      void createChatSocketTicket()
        .then(({ ticket }) => {
          if (disposed) {
            return;
          }
          socket = new WebSocket(chatWebSocketUrl(ticket));
          bindSocket(socket);
        })
        .catch(() => {
          scheduleReconnect();
          setStatus("实时连接不可用，仍可手动刷新");
        });
    }
    function scheduleReconnect() {
      if (disposed) {
        return;
      }
      attempts += 1;
      const delay = Math.min(15_000, 700 * 2 ** attempts);
      reconnectRef.current = window.setTimeout(connect, delay);
    }
    function bindSocket(nextSocket: WebSocket) {
      nextSocket.onopen = () => {
        if (disposed) {
          nextSocket.close();
          return;
        }
        attempts = 0;
        setStatus("实时同步已连接");
        void refreshUnreadCounts();
        const activeId = activeConversationIdRef.current;
        if (activeId) {
          void refreshMessages(activeId, connectedIdentity);
        }
      };
      nextSocket.onmessage = (event) => {
        let payload: ChatEvent | null = null;
        try {
          payload = JSON.parse(String(event.data)) as ChatEvent;
        } catch {
          return;
        }
        if (payload.type === "ready" && payload.onlineUserIds) {
          const onlineIds = new Set(payload.onlineUserIds);
          setUsers((current) => current.map((user) => ({ ...user, online: onlineIds.has(user.id) })));
          return;
        }
        if (payload.type === "presence-changed") {
          setUsers((current) =>
            current.map((user) => (user.id === payload.userId ? { ...user, online: payload.online } : user)),
          );
          return;
        }
        if (payload.type === "device-changed") {
          deviceKeysCacheRef.current.delete(payload.userId);
          if (payload.userId === context.auth?.id) {
            void migrateHistoryToKnownDevices(connectedIdentity, conversationsRef.current)
              .then((migratedCount) => {
                if (migratedCount) {
                  setStatus(`已为新设备迁移 ${migratedCount} 条历史消息`);
                }
              })
              .catch(() => setStatus("历史消息迁移失败，可稍后重试"));
          }
          return;
        }
        if (payload.type === "message-created") {
          const knownConversation = conversationsRef.current.some(
            (conversation) => conversation.id === payload.conversationId,
          );
          if (!knownConversation) {
            void refreshConversations();
            return;
          }
          setConversations((current) => {
            const updated = sortConversations(
              current.map((conversation) =>
                conversation.id === payload.conversationId
                  ? { ...conversation, updatedAt: payload.createdAt }
                  : conversation,
              ),
            );
            conversationsRef.current = updated;
            return updated;
          });
          if (payload.senderId !== context.auth?.id) {
            void refreshUnreadCounts();
          }
          if (payload.conversationId === activeConversationIdRef.current) {
            void refreshNewMessages(payload.conversationId, connectedIdentity);
          }
          return;
        }
        if (payload.type === "conversation-changed") {
          const knownConversation = conversationsRef.current.some(
            (conversation) => conversation.id === payload.conversationId,
          );
          if (!knownConversation) {
            void refreshConversations();
            return;
          }
          setConversations((current) => {
            const updated = sortConversations(
              current.map((conversation) =>
                conversation.id === payload.conversationId && payload.createdAt
                  ? { ...conversation, updatedAt: payload.createdAt }
                  : conversation,
              ),
            );
            conversationsRef.current = updated;
            return updated;
          });
          if (payload.conversationId === activeConversationIdRef.current) {
            if (messagesRef.current.some((message) => message.unreadable)) {
              scheduleUnreadableMessageRefresh(payload.conversationId, connectedIdentity);
            } else {
              void refreshNewMessages(payload.conversationId, connectedIdentity);
            }
          }
          return;
        }
        if (payload.type === "conversation-deleted") {
          const wasActive = activeConversationIdRef.current === payload.conversationId;
          setConversations((current) => current.filter((item) => item.id !== payload.conversationId));
          if (wasActive) {
            activateConversation("");
          }
          if (wasActive) {
            messagesConversationRef.current = "";
            messagesRef.current = [];
            setMessages([]);
          }
          setStatus("会话已被删除");
        }
      };
      nextSocket.onclose = () => {
        if (!disposed) {
          scheduleReconnect();
          setStatus("实时连接已断开，正在重连...");
        }
      };
    }
    connect();
    return () => {
      disposed = true;
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
      }
      unreadableRefreshTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      unreadableRefreshTimersRef.current.clear();
      socket?.close();
    };
  }, [
    enabled,
    identity,
    migrateHistoryToKnownDevices,
    refreshConversations,
    refreshMessages,
    refreshNewMessages,
    refreshUnreadCounts,
    scheduleUnreadableMessageRefresh,
  ]);

  function selectConversation(conversationId: string) {
    if (activeConversationId && activeConversationId !== conversationId) {
      const lastMessage = messagesRef.current.at(-1);
      if (lastMessage) {
        saveReadCursor(activeConversationId, lastMessage.createdAt);
      }
    }
    setUnreadAnchorMessageId("");
    activateConversation(conversationId);
  }

  function showUnreadMessages(conversationId: string) {
    if (!identity) {
      return;
    }
    if (conversationId !== activeConversationId) {
      pendingUnreadJumpRef.current = conversationId;
      selectConversation(conversationId);
      return;
    }
    void jumpToUnreadMessages(conversationId, identity);
  }

  function handleMessageScroll() {
    const list = messageListRef.current;
    if (
      !list ||
      automaticMessageScrollRef.current ||
      !activeConversationId ||
      !unreadCounts[activeConversationId] ||
      list.scrollTop + list.clientHeight < list.scrollHeight - 12
    ) {
      return;
    }
    const lastMessage = messagesRef.current.at(-1);
    if (lastMessage) {
      saveReadCursor(activeConversationId, lastMessage.createdAt);
      setUnreadAnchorMessageId("");
    }
  }

  async function createConversation(title: string, participantIds: string[]) {
    setCreating(true);
    setCreateError("");
    try {
      const created = await createChatConversation({ title, participantIds });
      await refreshConversations();
      activateConversation(created.id);
      setShowCreateDialog(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "无法创建聊天");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDeleteConversation() {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteChatConversation(deleteTarget.id);
      setConversations((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (activeConversationIdRef.current === deleteTarget.id) {
        activateConversation("");
      }
      if (activeConversationId === deleteTarget.id) {
        messagesConversationRef.current = "";
        messagesRef.current = [];
        setMessages([]);
      }
      setDeleteTarget(null);
      setStatus("会话已删除，所有成员的会话列表会同步更新");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "无法删除会话");
    } finally {
      setDeleting(false);
    }
  }

  function openCreateDialog() {
    if (!users.length) {
      setStatus("请先使用另一个账号注册并登录，才能创建一对一或群聊会话");
      return;
    }
    setCreateError("");
    setShowCreateDialog(true);
    void refreshUsers().catch((error) => setStatus(error instanceof Error ? error.message : "无法加载聊天成员"));
  }

  async function sendMessage() {
    if (!identity || !activeConversation || !draft.trim() || sending) {
      return;
    }
    const conversationId = activeConversation.id;
    const messageText = draft.trim();
    // Clear the submitted text first, so the next message can be entered while this request is pending.
    setDraft("");
    setSending(true);
    try {
      const deviceKeys = await deviceKeysForUsers(activeConversation.participantIds);
      const needsPlaintextCompatibility = requiresHttpPlaintextCompatibility(deviceKeys);
      const groupKey =
        !needsPlaintextCompatibility && activeConversation.participantIds.length > 2
          ? await ensureGroupKey(activeConversation, identity)
          : null;
      if (groupKey) {
        await ensureGroupKeyCoverage(activeConversation, groupKey);
      }
      const payload = groupKey
        ? await encryptGroupMessage(messageText, groupKey.rawKey, groupKey.keyVersion)
        : await encryptMessage(messageText, deviceKeys);
      const created = await sendChatMessage(conversationId, payload);
      const text = await decryptMessage(created, identity, groupKey?.rawKey);
      setMessages((current) => {
        if (messagesConversationRef.current !== created.conversationId) {
          return current;
        }
        const merged = mergeMessages(current, [{ ...created, text, unreadable: text === null }]);
        messagesRef.current = merged;
        return merged;
      });
    } catch (error) {
      // Do not overwrite text entered during the request; restore the failed message only if the input stayed empty.
      setDraft((current) => current || messageText);
      setStatus(error instanceof Error ? error.message : "消息发送失败");
    } finally {
      setSending(false);
      if (activeConversationIdRef.current === conversationId) {
        window.requestAnimationFrame(() => composerRef.current?.focus());
      }
    }
  }

  if (!enabled) {
    return <ChatUnavailable context={context} />;
  }

  return (
    <section className="chat-shell">
      <div className="chat-sidebar">
        <header className="chat-sidebar-head">
          <div>
            <h2>会话</h2>
            <span>{users.filter((user) => user.online).length} 位联系人在线</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={openCreateDialog}
            disabled={!identity || !users.length}
            title={identity ? (users.length ? "新建聊天" : "暂无其他已注册用户") : status}
            aria-label="新建聊天"
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="chat-conversation-list">
          {setupError ? (
            <div className="chat-setup-error" role="alert">
              <LockKeyhole size={16} aria-hidden="true" />
              <span>{status}</span>
            </div>
          ) : null}
          {!setupError &&
            conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const participantCount = conversation.participantIds.length;
              const canDelete = conversation.createdBy === context.auth!.id;
              const unreadCount = unreadCounts[conversation.id] ?? 0;
              return (
                <div className="chat-conversation-row" key={conversation.id}>
                  <button
                    className={isActive ? "chat-conversation active" : "chat-conversation"}
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <ConversationAvatar conversation={conversation} users={allUsers} currentUserId={context.auth!.id} />
                    <span>
                      <strong>
                        <ConversationTitle
                          conversation={conversation}
                          users={allUsers}
                          currentUserId={context.auth!.id}
                          plaintextCompatibilityMode={plaintextCompatibilityMode}
                        />
                      </strong>
                      <small>
                        {isActive ? "正在查看 · " : ""}
                        {plaintextCompatibilityMode
                          ? "HTTP 明文兼容"
                          : participantCount > 2
                            ? `${participantCount} 位成员`
                            : "端到端加密"}
                      </small>
                    </span>
                  </button>
                  {unreadCount ? (
                    <button
                      className="chat-unread-count"
                      type="button"
                      data-tooltip={`${unreadCount} 条新消息，定位到上次查看位置`}
                      aria-label={`${unreadCount} 条新消息，定位到上次查看位置`}
                      onClick={() => showUnreadMessages(conversation.id)}
                    >
                      {unreadLabel(unreadCount)}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      className="chat-conversation-delete"
                      type="button"
                      data-tooltip="删除会话"
                      aria-label="删除会话"
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(conversation);
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          {!setupError && !conversations.length ? (
            <div className="chat-list-empty">
              <MessagesSquare size={20} aria-hidden="true" />
              <p>{users.length ? "还没有会话" : "暂无其他已注册用户"}</p>
              <button type="button" onClick={openCreateDialog} disabled={!identity || !users.length}>
                发起聊天
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-main">
        {activeConversation ? (
          <>
            <header className="chat-main-head">
              <div>
                <h2>
                  <ConversationTitle
                    conversation={activeConversation}
                    users={allUsers}
                    currentUserId={context.auth!.id}
                    plaintextCompatibilityMode={plaintextCompatibilityMode}
                  />
                </h2>
                <span>
                  <LockKeyhole size={12} aria-hidden="true" />
                  {plaintextCompatibilityMode
                    ? "HTTP 明文兼容模式"
                    : activeConversation.participantIds.length > 2
                      ? `${activeConversation.participantIds.length} 位成员，端到端加密`
                      : "端到端加密"}
                </span>
              </div>
              {unreadCounts[activeConversation.id] ? (
                <button
                  className="chat-unread-jump"
                  type="button"
                  onClick={() => showUnreadMessages(activeConversation.id)}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                  {unreadCounts[activeConversation.id]} 条新消息
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                onClick={() => identity && void refreshMessages(activeConversation.id, identity)}
                data-tooltip="刷新消息"
                aria-label="刷新消息"
              >
                <RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" />
              </button>
            </header>
            <div className="chat-message-list" ref={messageListRef} aria-live="polite" onScroll={handleMessageScroll}>
              {loading ? <div className="chat-loading">正在读取消息...</div> : null}
              {!loading && !messages.length ? <div className="chat-loading">还没有消息</div> : null}
              {messages.map((message) => {
                const isSelf = message.senderId === context.auth!.id;
                const sender = allUsers.find((user) => user.id === message.senderId);
                return (
                  <div className="chat-message-entry" key={message.id}>
                    {message.id === unreadAnchorMessageId ? (
                      <div className="chat-unread-marker">从上次查看后开始</div>
                    ) : null}
                    <article
                      className={isSelf ? "chat-message self" : "chat-message"}
                      ref={(node) => {
                        if (node) {
                          messageNodesRef.current.set(message.id, node);
                        } else {
                          messageNodesRef.current.delete(message.id);
                        }
                      }}
                    >
                      {sender ? <ChatAvatar user={sender} /> : <CircleUserRound size={30} aria-hidden="true" />}
                      <div>
                        <header>
                          <strong>{isSelf ? "我" : userName(sender)}</strong>
                          <time>{formatMessageTime(message.createdAt)}</time>
                        </header>
                        <p className={message.unreadable ? "unreadable" : ""}>
                          {message.unreadable ? "此消息无法在当前设备解密" : message.text}
                        </p>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
            <div className="chat-composer">
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="输入消息"
                aria-label="消息内容"
                disabled={!identity}
              />
              <div>
                <span>
                  <LockKeyhole size={12} aria-hidden="true" />
                  {plaintextCompatibilityMode ? "HTTP 明文兼容模式" : "仅同步密文"}
                </span>
                <button
                  className="chat-primary-button"
                  type="button"
                  disabled={!identity || !draft.trim() || sending}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void sendMessage()}
                >
                  {sending ? (
                    <LoaderCircle size={15} className="spin" aria-hidden="true" />
                  ) : (
                    <Send size={15} aria-hidden="true" />
                  )}
                  发送
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="chat-empty-main">
            <MessagesSquare size={28} aria-hidden="true" />
            <h2>{setupError ? "无法启用端到端聊天" : "选择一个会话开始聊天"}</h2>
            <p>
              {setupError
                ? status
                : plaintextCompatibilityMode
                  ? "当前通过 HTTP 运行，聊天内容以明文兼容方式同步。"
                  : users.length
                    ? "消息会在当前设备加密，并以密文方式同步到会话成员的设备。"
                    : "请先使用另一个账号注册并登录，再创建一对一或群聊会话。"}
            </p>
            <button
              className="chat-primary-button"
              type="button"
              onClick={openCreateDialog}
              disabled={setupError || !identity || !users.length}
            >
              <Plus size={16} aria-hidden="true" />
              新建聊天
            </button>
          </div>
        )}
        <footer className="chat-status">
          <Wifi size={13} aria-hidden="true" />
          <span>{status}</span>
        </footer>
      </div>
      {showCreateDialog ? (
        <CreateConversationDialog
          users={users}
          creating={creating}
          error={createError}
          plaintextCompatibilityMode={plaintextCompatibilityMode}
          onClose={() => {
            setShowCreateDialog(false);
            setCreateError("");
          }}
          onCreate={(title, participantIds) => void createConversation(title, participantIds)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteConversationDialog
          conversation={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onClose={() => {
            if (!deleting) {
              setDeleteTarget(null);
              setDeleteError("");
            }
          }}
          onConfirm={() => void confirmDeleteConversation()}
        />
      ) : null}
    </section>
  );
}

export const chatPlugin: PluginDefinition = {
  id: "encrypted-chat",
  name: "聊天",
  description: "支持一对一聊天、群聊与实时同步；安全上下文中启用端到端加密。",
  icon: MessagesSquare,
  category: "协作",
  shortcuts: ["chat", "message"],
  accent: "teal",
  serviceRequirement: "on-demand",
  component: ChatPlugin,
};
