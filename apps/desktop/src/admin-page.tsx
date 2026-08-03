import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Cpu,
  Database,
  HardDrive,
  LogIn,
  LogOut,
  MemoryStick,
  MessageSquareText,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import {
  assetUrl,
  fetchAdminChatConversations,
  fetchAdminChatMessages,
  fetchAdminChatOverview,
  fetchAdminOverview,
  fetchAdminRecords,
  fetchAdminSystem,
  fetchAdminUsers,
  type AdminChatMessageRecord,
  type AdminChatOverview,
  type AdminConversationRecord,
  type AdminOverview,
  type AdminStorageRecord,
  type AdminSystemStatus,
  type AdminUserRecord,
  type AuthUser,
} from "./api";

type AdminSection = "overview" | "users" | "groups" | "messages" | "storage" | "system";

const emptyOverview: AdminOverview = {
  startedAt: "",
  uptimeSeconds: 0,
  userCount: 0,
  activeSessionCount: 0,
  workNotesArchiveCount: 0,
  translationConfigurationCount: 0,
};
const emptyChat: AdminChatOverview = {
  conversationCount: 0,
  groupCount: 0,
  directConversationCount: 0,
  messageCount: 0,
  todayMessageCount: 0,
};

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 ** 3) {
    return `${(value / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN", { hour12: false });
}
function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
}
function percent(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
}

export function AdminPage(props: {
  auth: AuthUser | null;
  onOpenLogin: () => void;
  onBack: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState(emptyOverview);
  const [chat, setChat] = useState(emptyChat);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [records, setRecords] = useState<AdminStorageRecord[]>([]);
  const [system, setSystem] = useState<AdminSystemStatus | null>(null);
  const [conversations, setConversations] = useState<AdminConversationRecord[]>([]);
  const [messages, setMessages] = useState<AdminChatMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    if (props.auth?.role !== "ADMIN") {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextSystem, nextUsers, nextRecords, nextChat, nextConversations, nextMessages] =
        await Promise.all([
          fetchAdminOverview(),
          fetchAdminSystem(),
          fetchAdminUsers(),
          fetchAdminRecords(),
          fetchAdminChatOverview(),
          fetchAdminChatConversations(),
          fetchAdminChatMessages(),
        ]);
      setOverview(nextOverview);
      setSystem(nextSystem);
      setUsers(nextUsers);
      setRecords(nextRecords);
      setChat(nextChat);
      setConversations(nextConversations);
      setMessages(nextMessages);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取管理数据");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    if (props.auth?.role !== "ADMIN") {
      return undefined;
    }
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [props.auth?.id]);

  const groupConversations = useMemo(() => conversations.filter((item) => item.memberCount > 2), [conversations]);
  if (!props.auth || props.auth.role !== "ADMIN") {
    const authorized = Boolean(props.auth);
    return (
      <main className="admin-page">
        <AdminTopbar onBack={props.onBack} />
        <section className="admin-access">
          {authorized ? <ShieldAlert size={24} /> : <LogIn size={24} />}
          <h1>{authorized ? "没有管理权限" : "登录后进入管理端"}</h1>
          <p>{authorized ? "当前账号不具备服务管理权限。" : "管理端仅展示运行指标和加密聊天元数据。"}</p>
          <button
            className="admin-primary-button"
            type="button"
            onClick={authorized ? props.onBack : props.onOpenLogin}
          >
            {authorized ? <ArrowLeft size={16} /> : <LogIn size={16} />}
            {authorized ? "返回工作台" : "登录"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <AdminTopbar onBack={props.onBack} auth={props.auth} onSignOut={props.onSignOut} />
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="管理模块">
          <AdminNav
            icon={BarChart3}
            label="总览"
            active={section === "overview"}
            onClick={() => setSection("overview")}
          />
          <AdminNav
            icon={UsersRound}
            label="用户"
            active={section === "users"}
            onClick={() => setSection("users")}
            count={users.length}
          />
          <AdminNav
            icon={MessageSquareText}
            label="群组"
            active={section === "groups"}
            onClick={() => setSection("groups")}
            count={chat.groupCount}
          />
          <AdminNav
            icon={Activity}
            label="聊天监控"
            active={section === "messages"}
            onClick={() => setSection("messages")}
            count={messages.length}
          />
          <AdminNav
            icon={Database}
            label="数据存储"
            active={section === "storage"}
            onClick={() => setSection("storage")}
          />
          <AdminNav
            icon={ServerCog}
            label="服务器"
            active={section === "system"}
            onClick={() => setSection("system")}
          />
        </nav>
        <section className="admin-workspace">
          <header className="admin-workspace-head">
            <div>
              <p>管理端 / {section}</p>
              <h1>
                {section === "overview"
                  ? "服务总览"
                  : section === "users"
                    ? "用户目录"
                    : section === "groups"
                      ? "群组目录"
                      : section === "messages"
                        ? "聊天监控"
                        : section === "storage"
                          ? "数据存储"
                          : "服务器监控"}
              </h1>
            </div>
            <button className="admin-secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "is-spinning" : ""} />
              {loading ? "刷新中" : "刷新"}
            </button>
          </header>
          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}
          {section === "overview" ? <Overview overview={overview} chat={chat} system={system} /> : null}
          {section === "users" ? <UserModule users={users} /> : null}
          {section === "groups" ? <GroupModule groups={groupConversations} /> : null}
          {section === "messages" ? (
            <MessageModule chat={chat} messages={messages} conversations={conversations} />
          ) : null}
          {section === "storage" ? <StorageModule records={records} system={system} /> : null}
          {section === "system" ? <SystemModule system={system} /> : null}
        </section>
      </div>
    </main>
  );
}

function Overview({
  overview,
  chat,
  system,
}: {
  overview: AdminOverview;
  chat: AdminChatOverview;
  system: AdminSystemStatus | null;
}) {
  return (
    <div className="admin-module">
      <div className="admin-kpi-grid">
        <Kpi
          label="服务运行"
          value={overview.startedAt ? formatUptime(overview.uptimeSeconds) : "--"}
          detail={overview.startedAt ? `启动于 ${formatDate(overview.startedAt)}` : "正在读取"}
        />
        <Kpi label="在线会话" value={String(overview.activeSessionCount)} detail={`${overview.userCount} 个注册用户`} />
        <Kpi label="中心化消息" value={String(chat.messageCount)} detail={`今日 ${chat.todayMessageCount} 条`} />
        <Kpi
          label="密文存储"
          value={formatBytes(system?.totalUserStorageBytes ?? 0)}
          detail={`${overview.workNotesArchiveCount} 个笔记归档`}
        />
      </div>
      <SystemModule system={system} />
    </div>
  );
}
function UserModule({ users }: { users: AdminUserRecord[] }) {
  return (
    <Table headers={["用户", "身份", "创建时间"]}>
      {users.map((user) => (
        <div className="admin-table-row" key={user.id}>
          <span>
            <strong>{user.displayName}</strong>
            <small>
              @{user.username} · {user.id.slice(0, 8)}
            </small>
          </span>
          <span>{user.role === "ADMIN" ? "管理员" : "普通用户"}</span>
          <time>{formatDate(user.createdAt)}</time>
        </div>
      ))}
    </Table>
  );
}
function GroupModule({ groups }: { groups: AdminConversationRecord[] }) {
  return (
    <Table headers={["群组", "成员 / 消息", "密文 / 最近活跃"]}>
      {groups.map((group) => (
        <div className="admin-table-row admin-chat-row" key={group.id}>
          <span>
            <strong>{group.title || "未命名群组"}</strong>
            <small>{group.id}</small>
          </span>
          <span>
            {group.memberCount} 人 · {group.messageCount} 条
          </span>
          <span>
            {formatBytes(group.ciphertextBytes)}
            <small>{formatDate(group.lastMessageAt)}</small>
          </span>
        </div>
      ))}
      {!groups.length ? <p className="admin-empty">暂无群组数据。</p> : null}
    </Table>
  );
}
function MessageModule({
  chat,
  messages,
  conversations,
}: {
  chat: AdminChatOverview;
  messages: AdminChatMessageRecord[];
  conversations: AdminConversationRecord[];
}) {
  return (
    <div className="admin-module">
      <div className="admin-kpi-grid">
        <Kpi label="会话" value={String(chat.conversationCount)} detail={`${chat.directConversationCount} 个单聊`} />
        <Kpi label="群组" value={String(chat.groupCount)} detail="成员与消息按密文统计" />
        <Kpi label="总消息" value={String(chat.messageCount)} detail="不展示消息正文" />
        <Kpi label="今日新增" value={String(chat.todayMessageCount)} detail="东八区自然日" />
      </div>
      <Table headers={["会话", "成员 / 消息", "密文 / 最近活跃"]}>
        {conversations.map((conversation) => (
          <div className="admin-table-row admin-chat-row" key={conversation.id}>
            <span>
              <strong>{conversation.title || "未命名会话"}</strong>
              <small>{conversation.id}</small>
            </span>
            <span>
              {conversation.memberCount} 人 · {conversation.messageCount} 条
            </span>
            <span>
              {formatBytes(conversation.ciphertextBytes)}
              <small>{formatDate(conversation.lastMessageAt)}</small>
            </span>
          </div>
        ))}
        {!conversations.length ? <p className="admin-empty">暂无会话数据。</p> : null}
      </Table>
      <Table headers={["消息", "会话 / 发送者", "密文体积 / 时间"]}>
        {messages.map((message) => (
          <div className="admin-table-row admin-chat-row" key={message.id}>
            <span>
              <strong>{message.id.slice(0, 12)}</strong>
              <small>仅元数据</small>
            </span>
            <span>
              <small>
                {message.conversationId.slice(0, 12)} · {message.senderId.slice(0, 8)}
              </small>
            </span>
            <span>
              {formatBytes(message.ciphertextBytes)}
              <small>{formatDate(message.createdAt)}</small>
            </span>
          </div>
        ))}
      </Table>
    </div>
  );
}
function StorageModule({ records, system }: { records: AdminStorageRecord[]; system: AdminSystemStatus | null }) {
  return (
    <div className="admin-module">
      <Table headers={["存储类型", "用户", "体积 / 更新时间"]}>
        {records.map((record) => (
          <div className="admin-table-row admin-chat-row" key={`${record.kind}-${record.userId}-${record.updatedAt}`}>
            <span>
              <strong>{record.kind}</strong>
              <small>{record.userId}</small>
            </span>
            <span>{formatBytes(record.sizeBytes)}</span>
            <time>{formatDate(record.updatedAt)}</time>
          </div>
        ))}
      </Table>
      <p className="admin-storage-caption">服务数据目录可用空间：{formatBytes(system?.disk.usableBytes ?? 0)}</p>
    </div>
  );
}
function SystemModule({ system }: { system: AdminSystemStatus | null }) {
  const cpu = system?.cpu.systemLoadPercent ?? 0;
  const memory = percent(system?.memory.usedBytes ?? 0, system?.memory.totalBytes ?? 0);
  const disk = percent(system?.disk.usedBytes ?? 0, system?.disk.totalBytes ?? 0);
  return (
    <section className="admin-resource-panel">
      <Resource
        icon={Cpu}
        label="CPU"
        value={`${cpu.toFixed(1)}%`}
        percent={cpu}
        detail={`${system?.cpu.availableProcessors ?? 0} 核；进程 ${system?.cpu.processLoadPercent.toFixed(1) ?? "0.0"}%`}
      />
      <Resource
        icon={MemoryStick}
        label="内存"
        value={`${memory.toFixed(1)}%`}
        percent={memory}
        detail={`${formatBytes(system?.memory.usedBytes ?? 0)} / ${formatBytes(system?.memory.totalBytes ?? 0)}`}
      />
      <Resource
        icon={HardDrive}
        label="磁盘"
        value={`${disk.toFixed(1)}%`}
        percent={disk}
        detail={`${formatBytes(system?.disk.usableBytes ?? 0)} 可用`}
      />
    </section>
  );
}
function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="admin-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Resource({
  icon: Icon,
  label,
  value,
  percent: valuePercent,
  detail,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  percent: number;
  detail: string;
}) {
  return (
    <section className="admin-resource">
      <span>
        <Icon size={16} />
        {label}
      </span>
      <strong>{value}</strong>
      <i>
        <b style={{ width: `${valuePercent}%` }} />
      </i>
      <small>{detail}</small>
    </section>
  );
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <section className="admin-table-panel">
      <div className="admin-table">
        <div className="admin-table-head">
          {headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}
function AdminNav({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: typeof Activity;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      <Icon size={17} />
      <span>{label}</span>
      {count !== undefined ? <small>{count}</small> : null}
    </button>
  );
}
function AdminTopbar(props: { onBack: () => void; auth?: AuthUser; onSignOut?: () => Promise<void> }) {
  return (
    <header className="admin-page-topbar">
      <button className="admin-back-button" type="button" onClick={props.onBack}>
        <ArrowLeft size={16} />
        工作台
      </button>
      <div className="admin-page-brand">
        <ServerCog size={18} />
        <strong>ForgeDesk 管理端</strong>
      </div>
      {props.auth ? (
        <div className="admin-page-account">
          <span className="admin-account-avatar">
            {props.auth.avatarUrl ? <img src={assetUrl(props.auth.avatarUrl)} alt="" /> : <UsersRound size={15} />}
          </span>
          <span className="admin-account-copy">
            <strong>{props.auth.displayName}</strong>
            <small>管理员</small>
          </span>
          <button className="icon-button" type="button" onClick={() => void props.onSignOut?.()} aria-label="退出登录">
            <LogOut size={16} />
          </button>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}
