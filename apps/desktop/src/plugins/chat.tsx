import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  CircleUserRound,
  Crown,
  Info,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  MessagesSquare,
  Plus,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import {
  assetUrl,
  chatWebSocketUrl,
  createChatConversation,
  createChatSocketTicket,
  deleteChatConversation,
  fetchChatConversations,
  fetchChatMessages,
  fetchChatTransportKey,
  fetchChatUnreadCounts,
  fetchChatUsers,
  sendChatMessage,
  updateChatConversationProfile,
  type ChatConversation,
  type ChatUser,
  type EncryptedChatMessage,
} from "../api";
import {
  createChatTransportSession,
  decryptChatTransportMessage,
  encryptChatTransportMessage,
  type ChatTransportSession,
} from "../chat-crypto";
import type { PluginContext, PluginDefinition } from "../types";

type ChatEvent =
  | { type: "ready"; onlineUserIds?: string[] }
  | { type: "presence-changed"; userId: string; online: boolean }
  | { type: "conversation-changed"; conversationId: string; createdAt?: string }
  | { type: "message-created"; conversationId: string; senderId: string; createdAt: string }
  | { type: "conversation-deleted"; conversationId: string }
  | { type: "signal" };

type RenderedMessage = EncryptedChatMessage & { text: string | null; unreadable: boolean };

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

async function renderMessages(messages: EncryptedChatMessage[], transport: ChatTransportSession) {
  return Promise.all(
    messages.map(async (message) => {
      try {
        const text = decryptChatTransportMessage(message, transport);
        return { ...message, text, unreadable: false };
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

function formatConversationDate(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
}

function ConversationTitle({
  conversation,
  users,
  currentUserId,
}: {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: string;
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
  return <>{conversation.title || (isGroup ? "群聊" : fallback || "聊天")}</>;
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
            ? "登录后即可建立与服务端之间的加密聊天通道。"
            : "切换到服务运行模式后，可使用服务端中心化加密分发、群聊与实时同步。"}
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
}: {
  users: ChatUser[];
  onClose: () => void;
  onCreate: (title: string, participantIds: string[]) => void;
  creating: boolean;
  error: string;
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
            <h2>{group ? "创建群聊" : "发起聊天"}</h2>
            <p>消息正文在客户端加密后发送，由服务端统一分发和加密存储。</p>
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

function GroupInfoPanel({
  conversation,
  users,
  currentUserId,
  editing,
  draft,
  saving,
  error,
  onClose,
  onStartEdit,
  onCancelEdit,
  onChangeDraft,
  onSave,
}: {
  conversation: ChatConversation;
  users: ChatUser[];
  currentUserId: string;
  editing: boolean;
  draft: { title: string; announcement: string };
  saving: boolean;
  error: string;
  onClose: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: { title: string; announcement: string }) => void;
  onSave: () => void;
}) {
  const members = conversation.participantIds
    .map((memberId) => users.find((user) => user.id === memberId))
    .filter((member): member is ChatUser => Boolean(member));
  const owner = members.find((member) => member.id === conversation.createdBy);
  const onlineCount = members.filter((member) => member.online).length;
  const isOwner = conversation.createdBy === currentUserId;

  return (
    <aside className="chat-group-panel" aria-label="群聊资料">
      <header className="chat-group-panel-head">
        <div>
          <span>群聊资料</span>
          <strong>{members.length} 位成员</strong>
        </div>
        <button className="chat-panel-close" type="button" onClick={onClose} aria-label="关闭群聊资料">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="chat-group-panel-content">
        <div className="chat-group-identity">
          <span className="chat-group-identity-icon" aria-hidden="true">
            <UsersRound size={22} />
          </span>
          <div>
            <strong>{conversation.title || "群聊"}</strong>
            <span>{onlineCount} 人在线</span>
          </div>
        </div>

        <section className="chat-group-section">
          <div className="chat-group-section-head">
            <h3>群公告</h3>
            {isOwner && !editing ? (
              <button type="button" onClick={onStartEdit}>
                <Pencil size={14} aria-hidden="true" />
                编辑
              </button>
            ) : null}
          </div>
          {editing ? (
            <div className="chat-group-edit-form">
              <label>
                <span>群名称</span>
                <input
                  value={draft.title}
                  maxLength={64}
                  onChange={(event) => onChangeDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label>
                <span>公告</span>
                <textarea
                  value={draft.announcement}
                  maxLength={280}
                  onChange={(event) => onChangeDraft({ ...draft, announcement: event.target.value })}
                  placeholder="写下群内成员都应看到的信息"
                />
              </label>
              {error ? (
                <p className="chat-group-edit-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div>
                <button className="chat-secondary-button" type="button" onClick={onCancelEdit} disabled={saving}>
                  取消
                </button>
                <button className="chat-primary-button" type="button" onClick={onSave} disabled={saving}>
                  {saving ? (
                    <LoaderCircle size={15} className="spin" aria-hidden="true" />
                  ) : (
                    <Check size={15} aria-hidden="true" />
                  )}
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p className={conversation.announcement ? "chat-group-announcement" : "chat-group-announcement empty"}>
              {conversation.announcement || "群主还没有设置公告。"}
            </p>
          )}
        </section>

        <section className="chat-group-section">
          <div className="chat-group-section-head">
            <h3>成员</h3>
            <span>{members.length}</span>
          </div>
          <div className="chat-group-member-list">
            {members.map((member) => {
              const isOwnerMember = member.id === conversation.createdBy;
              return (
                <div className="chat-group-member" key={member.id}>
                  <ChatAvatar user={member} />
                  <span>
                    <strong>{member.id === currentUserId ? "我" : userName(member)}</strong>
                    <small>{member.online ? "在线" : "离线"}</small>
                  </span>
                  {isOwnerMember ? <Crown size={14} aria-label="群主" /> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="chat-group-meta" aria-label="群聊信息">
          <div>
            <span>群主</span>
            <strong>{owner ? userName(owner) : "未知"}</strong>
          </div>
          <div>
            <span>创建时间</span>
            <strong>{formatConversationDate(conversation.createdAt)}</strong>
          </div>
          <div>
            <span>安全方式</span>
            <strong>中心化加密分发</strong>
          </div>
        </section>

        <p className="chat-group-security-note">当前支持查看成员和维护群资料；成员调整会作为独立的群组管理能力提供。</p>
      </div>
    </aside>
  );
}

function ChatPlugin({ context }: { context: PluginContext }) {
  const enabled = context.runtimeMode === "connected" && context.serviceOnline && Boolean(context.auth);
  const [transport, setTransport] = useState<ChatTransportSession | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<RenderedMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("正在建立加密通道...");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [editingGroupProfile, setEditingGroupProfile] = useState(false);
  const [groupProfileDraft, setGroupProfileDraft] = useState({ title: "", announcement: "" });
  const [savingGroupProfile, setSavingGroupProfile] = useState(false);
  const [groupProfileError, setGroupProfileError] = useState("");
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
  const setupError = !transport && status !== "正在建立加密通道...";
  const isActiveGroup = Boolean(activeConversation && activeConversation.participantIds.length > 2);

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
    setTransport(null);
    readCursorsRef.current = context.auth ? loadReadCursors(context.auth.id) : {};
    readCursorRevisionRef.current += 1;
    activeConversationIdRef.current = "";
    setActiveConversationId("");
    setUnreadCounts({});
    setUnreadAnchorMessageId("");
  }, [context.auth?.id]);

  useEffect(() => {
    if (!isActiveGroup || !activeConversation) {
      setShowGroupInfo(false);
      setEditingGroupProfile(false);
      return;
    }
    setEditingGroupProfile(false);
    setGroupProfileError("");
    setGroupProfileDraft({
      title: activeConversation.title,
      announcement: activeConversation.announcement,
    });
  }, [activeConversation?.id, isActiveGroup]);

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

  const refreshMessages = useCallback(
    async (conversationId: string, currentTransport: ChatTransportSession) => {
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
        const page = await fetchChatMessages(conversationId, currentTransport.clientPublicKey);
        const rendered = await renderMessages(page.messages, currentTransport);
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
    [saveReadCursor],
  );

  const refreshNewMessages = useCallback(
    async (conversationId: string, currentTransport: ChatTransportSession) => {
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
          const page = await fetchChatMessages(conversationId, currentTransport.clientPublicKey, { after });
          const rendered = await renderMessages(page.messages, currentTransport);
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
    [saveReadCursor],
  );

  const jumpToUnreadMessages = useCallback(
    async (conversationId: string, currentTransport: ChatTransportSession) => {
      const cursor = readCursorsRef.current[conversationId];
      if (!cursor) {
        return;
      }
      let rendered = messagesRef.current;
      if (!rendered.length || cursor < rendered[0].createdAt) {
        setLoading(true);
        try {
          const page = await fetchChatMessages(conversationId, currentTransport.clientPublicKey, { after: cursor });
          rendered = await renderMessages(page.messages, currentTransport);
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
    [scrollToMessage],
  );

  useEffect(() => {
    if (!enabled || !context.auth) {
      setTransport(null);
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
      setStatus("正在建立加密通道...");
      try {
        const storedReadCursors = loadReadCursors(context.auth!.id);
        readCursorsRef.current = storedReadCursors;
        const [{ publicKey }, latestUsers, latestConversations, latestUnreadCounts] = await Promise.all([
          fetchChatTransportKey(),
          fetchChatUsers(),
          fetchChatConversations(),
          fetchChatUnreadCounts(storedReadCursors),
        ]);
        const nextTransport = createChatTransportSession(publicKey);
        setUsers(latestUsers);
        setConversations(latestConversations);
        setUnreadCounts(latestUnreadCounts);
        if (!activeConversationIdRef.current) {
          activateConversation(latestConversations[0]?.id ?? "");
        }
        if (!cancelled) {
          setTransport(nextTransport);
          setStatus("中心化加密分发已就绪");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "无法建立聊天加密通道");
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [activateConversation, context.auth, enabled]);

  useEffect(() => {
    if (!transport || !activeConversationId) {
      return;
    }
    void refreshMessages(activeConversationId, transport);
  }, [activeConversationId, refreshMessages, transport]);

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
    if (!conversationId || conversationId !== activeConversationId || !transport || !messages.length) {
      return;
    }
    pendingUnreadJumpRef.current = "";
    void jumpToUnreadMessages(conversationId, transport);
  }, [activeConversationId, jumpToUnreadMessages, messages.length, transport]);

  useEffect(() => {
    if (!enabled || !transport) {
      return undefined;
    }
    const connectedTransport = transport;
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
          void refreshMessages(activeId, connectedTransport);
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
            void refreshNewMessages(payload.conversationId, connectedTransport);
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
            void refreshNewMessages(payload.conversationId, connectedTransport);
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
      socket?.close();
    };
  }, [enabled, transport, refreshConversations, refreshMessages, refreshNewMessages, refreshUnreadCounts]);

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
    if (!transport) {
      return;
    }
    if (conversationId !== activeConversationId) {
      pendingUnreadJumpRef.current = conversationId;
      selectConversation(conversationId);
      return;
    }
    void jumpToUnreadMessages(conversationId, transport);
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

  async function saveGroupProfile() {
    if (!activeConversation || !isActiveGroup || savingGroupProfile) {
      return;
    }
    setSavingGroupProfile(true);
    setGroupProfileError("");
    try {
      const updated = await updateChatConversationProfile(activeConversation.id, groupProfileDraft);
      const next = sortConversations(
        conversationsRef.current.map((conversation) => (conversation.id === updated.id ? updated : conversation)),
      );
      conversationsRef.current = next;
      setConversations(next);
      setGroupProfileDraft({ title: updated.title, announcement: updated.announcement });
      setEditingGroupProfile(false);
      setStatus("群资料已更新，成员会实时收到变更");
    } catch (error) {
      setGroupProfileError(error instanceof Error ? error.message : "无法保存群资料");
    } finally {
      setSavingGroupProfile(false);
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
    if (!transport || !activeConversation || !draft.trim() || sending) {
      return;
    }
    const conversationId = activeConversation.id;
    const messageText = draft.trim();
    // Clear the submitted text first, so the next message can be entered while this request is pending.
    setDraft("");
    setSending(true);
    try {
      const payload = encryptChatTransportMessage(messageText, conversationId, transport);
      const created = await sendChatMessage(conversationId, payload);
      const text = decryptChatTransportMessage(created, transport);
      setMessages((current) => {
        if (messagesConversationRef.current !== created.conversationId) {
          return current;
        }
        const merged = mergeMessages(current, [{ ...created, text, unreadable: false }]);
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
    <section className={showGroupInfo && isActiveGroup ? "chat-shell with-group-panel" : "chat-shell"}>
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
            disabled={!transport || !users.length}
            title={transport ? (users.length ? "新建聊天" : "暂无其他已注册用户") : status}
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
                        />
                      </strong>
                      <small>
                        {isActive ? "正在查看 · " : ""}
                        {participantCount > 2 ? `${participantCount} 位成员` : "中心化加密"}
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
              <button type="button" onClick={openCreateDialog} disabled={!transport || !users.length}>
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
                  />
                </h2>
                <span>
                  <LockKeyhole size={12} aria-hidden="true" />
                  {activeConversation.participantIds.length > 2
                    ? `${activeConversation.participantIds.length} 位成员，中心化加密分发`
                    : "中心化加密分发"}
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
              {isActiveGroup ? (
                <button
                  className={showGroupInfo ? "chat-group-trigger selected" : "chat-group-trigger"}
                  type="button"
                  onClick={() => setShowGroupInfo((current) => !current)}
                  aria-label={showGroupInfo ? "收起群聊资料" : "查看群聊资料"}
                >
                  <Info size={16} aria-hidden="true" />
                  <span>{showGroupInfo ? "收起资料" : "群资料"}</span>
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                onClick={() => transport && void refreshMessages(activeConversation.id, transport)}
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
                disabled={!transport}
              />
              <div>
                <span>
                  <LockKeyhole size={12} aria-hidden="true" />
                  消息以加密传输，服务端仅保留加密内容
                </span>
                <button
                  className="chat-primary-button"
                  type="button"
                  disabled={!transport || !draft.trim() || sending}
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
            <h2>{setupError ? "无法建立加密聊天通道" : "选择一个会话开始聊天"}</h2>
            <p>
              {setupError
                ? status
                : users.length
                  ? "消息通过服务端统一分发，传输和存储内容均使用加密保护。"
                  : "请先使用另一个账号注册并登录，再创建一对一或群聊会话。"}
            </p>
            <button
              className="chat-primary-button"
              type="button"
              onClick={openCreateDialog}
              disabled={setupError || !transport || !users.length}
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
      {activeConversation && showGroupInfo && isActiveGroup ? (
        <GroupInfoPanel
          conversation={activeConversation}
          users={allUsers}
          currentUserId={context.auth!.id}
          editing={editingGroupProfile}
          draft={groupProfileDraft}
          saving={savingGroupProfile}
          error={groupProfileError}
          onClose={() => {
            setShowGroupInfo(false);
            setEditingGroupProfile(false);
          }}
          onStartEdit={() => {
            setGroupProfileDraft({
              title: activeConversation.title,
              announcement: activeConversation.announcement,
            });
            setGroupProfileError("");
            setEditingGroupProfile(true);
          }}
          onCancelEdit={() => {
            setGroupProfileDraft({
              title: activeConversation.title,
              announcement: activeConversation.announcement,
            });
            setGroupProfileError("");
            setEditingGroupProfile(false);
          }}
          onChangeDraft={setGroupProfileDraft}
          onSave={() => void saveGroupProfile()}
        />
      ) : null}
      {showCreateDialog ? (
        <CreateConversationDialog
          users={users}
          creating={creating}
          error={createError}
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
  description: "支持一对一聊天、群聊与实时同步；消息通过服务端中心化加密分发。",
  icon: MessagesSquare,
  category: "协作",
  shortcuts: ["chat", "message"],
  accent: "teal",
  serviceRequirement: "on-demand",
  component: ChatPlugin,
};
