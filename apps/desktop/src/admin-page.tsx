import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  HardDrive,
  LogIn,
  LogOut,
  MemoryStick,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  assetUrl,
  fetchAdminOverview,
  fetchAdminRecords,
  fetchAdminSystem,
  fetchAdminUsers,
  type AdminOverview,
  type AdminStorageRecord,
  type AdminSystemStatus,
  type AdminUserRecord,
  type AuthUser,
} from "./api";

const emptyOverview: AdminOverview = {
  startedAt: "",
  uptimeSeconds: 0,
  userCount: 0,
  activeSessionCount: 0,
  workNotesArchiveCount: 0,
  translationConfigurationCount: 0,
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
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分`;
}

function usagePercent(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
}

function ResourceMeter(props: { icon: typeof Cpu; label: string; value: string; detail: string; percent: number }) {
  const Icon = props.icon;
  const severity = props.percent >= 90 ? "critical" : props.percent >= 75 ? "warning" : "normal";
  return (
    <section className="admin-resource-meter">
      <div className="admin-resource-head">
        <span>
          <Icon size={17} aria-hidden="true" />
          {props.label}
        </span>
        <strong>{props.value}</strong>
      </div>
      <div className={`admin-usage-track ${severity}`}>
        <i style={{ width: `${props.percent}%` }} />
      </div>
      <small>{props.detail}</small>
    </section>
  );
}

export function AdminPage(props: {
  auth: AuthUser | null;
  onOpenLogin: () => void;
  onBack: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [records, setRecords] = useState<AdminStorageRecord[]>([]);
  const [system, setSystem] = useState<AdminSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    if (props.auth?.role !== "ADMIN") {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextUsers, nextRecords, nextSystem] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminRecords(),
        fetchAdminSystem(),
      ]);
      setOverview(nextOverview);
      setUsers(nextUsers);
      setRecords(nextRecords);
      setSystem(nextSystem);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取管理数据");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    if (props.auth?.role !== "ADMIN") {
      return;
    }
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [props.auth?.id]);

  if (!props.auth) {
    return (
      <main className="admin-page">
        <AdminTopbar onBack={props.onBack} />
        <section className="admin-access">
          <LogIn size={23} aria-hidden="true" />
          <h1>登录后进入管理端</h1>
          <p>管理端只展示服务运行、容量和用户存储索引，不展示密钥、密码或笔记正文。</p>
          <button className="admin-primary-button" type="button" onClick={props.onOpenLogin}>
            <LogIn size={16} aria-hidden="true" />
            登录
          </button>
        </section>
      </main>
    );
  }
  if (props.auth.role !== "ADMIN") {
    return (
      <main className="admin-page">
        <AdminTopbar onBack={props.onBack} />
        <section className="admin-access">
          <ShieldAlert size={23} aria-hidden="true" />
          <h1>没有管理权限</h1>
          <p>当前账号不具备服务管理权限。请使用管理员身份登录。</p>
          <button className="admin-secondary-button" type="button" onClick={props.onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            返回工作台
          </button>
        </section>
      </main>
    );
  }

  const memoryPercent = system ? usagePercent(system.memory.usedBytes, system.memory.totalBytes) : 0;
  const diskPercent = system ? usagePercent(system.disk.usedBytes, system.disk.totalBytes) : 0;
  const cpuPercent = system?.cpu.systemLoadPercent ?? 0;
  return (
    <main className="admin-page">
      <AdminTopbar onBack={props.onBack} auth={props.auth} onSignOut={props.onSignOut} />
      <section className="admin-page-content">
        <div className="admin-page-heading">
          <div>
            <h1>服务管理端</h1>
            <p>服务状态、资源余量与用户归档均由后端实时采集。数据每 30 秒刷新一次。</p>
          </div>
          <button className="admin-primary-button" type="button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "is-spinning" : ""} aria-hidden="true" />
            {loading ? "读取中" : "刷新"}
          </button>
        </div>
        {error ? (
          <p className="translation-error" role="alert">
            {error}
          </p>
        ) : null}
        <section className="admin-service-strip" aria-label="服务状态">
          <AdminSummary
            icon={ServerCog}
            label="服务运行"
            value={overview.startedAt ? formatUptime(overview.uptimeSeconds) : "检查中"}
            detail={overview.startedAt ? `启动于 ${formatDate(overview.startedAt)}` : ""}
          />
          <AdminSummary
            icon={UsersRound}
            label="服务账号"
            value={String(overview.userCount)}
            detail={`${overview.activeSessionCount} 个有效会话`}
          />
          <AdminSummary
            icon={Database}
            label="用户归档"
            value={formatBytes(system?.totalUserStorageBytes ?? 0)}
            detail={`${overview.workNotesArchiveCount} 个笔记归档`}
          />
          <AdminSummary
            icon={ShieldCheck}
            label="翻译配置"
            value={String(overview.translationConfigurationCount)}
            detail="凭据不会在管理端展示"
          />
        </section>
        <section className="admin-section">
          <header>
            <div>
              <h2>资源监控</h2>
              <p>磁盘以服务数据目录所在卷计算，容量接近上限时会以黄色和红色提示。</p>
            </div>
            <Activity size={19} aria-hidden="true" />
          </header>
          <div className="admin-resource-grid">
            <ResourceMeter
              icon={Cpu}
              label="系统 CPU"
              value={`${cpuPercent.toFixed(1)}%`}
              detail={`${system?.cpu.availableProcessors ?? 0} 核；进程 ${system?.cpu.processLoadPercent.toFixed(1) ?? "0.0"}%`}
              percent={cpuPercent}
            />
            <ResourceMeter
              icon={MemoryStick}
              label="物理内存"
              value={`${memoryPercent.toFixed(1)}%`}
              detail={`${formatBytes(system?.memory.usedBytes ?? 0)} 已用 / ${formatBytes(system?.memory.totalBytes ?? 0)}`}
              percent={memoryPercent}
            />
            <ResourceMeter
              icon={HardDrive}
              label="服务磁盘"
              value={`${diskPercent.toFixed(1)}%`}
              detail={`${formatBytes(system?.disk.usableBytes ?? 0)} 可用；${system?.disk.path ?? ""}`}
              percent={diskPercent}
            />
          </div>
        </section>
        <section className="admin-table-panel admin-user-storage">
          <header>
            <div>
              <h2>用户目录存储</h2>
              <p>按用户目录汇总文件数、占用空间和最近更新；仅展示索引。</p>
            </div>
            <strong>{system?.userStorage.length ?? 0} 个目录</strong>
          </header>
          <div className="admin-table">
            <div className="admin-table-head admin-storage-row">
              <span>用户目录</span>
              <span>文件数</span>
              <span>占用</span>
              <span>最近更新</span>
            </div>
            {(system?.userStorage ?? []).map((usage) => (
              <div className="admin-table-row admin-storage-row" key={usage.userId}>
                <span>
                  <strong>{usage.userId}</strong>
                </span>
                <span>{usage.fileCount}</span>
                <span>{formatBytes(usage.sizeBytes)}</span>
                <time>{formatDate(usage.updatedAt)}</time>
              </div>
            ))}
            {!system?.userStorage.length ? <p className="admin-empty">暂无用户归档文件。</p> : null}
          </div>
        </section>
        <section className="admin-data-grid">
          <AdminTable title="账号" count={`${users.length} 个账号`} headers={["用户", "角色", "创建时间"]}>
            {users.map((user) => (
              <div className="admin-table-row" key={user.id}>
                <span>
                  <strong>{user.displayName}</strong>
                  <small>{user.username}</small>
                </span>
                <span className={user.role === "ADMIN" ? "admin-role" : ""}>
                  {user.role === "ADMIN" ? "管理员" : "普通用户"}
                </span>
                <time>{formatDate(user.createdAt)}</time>
              </div>
            ))}
          </AdminTable>
          <AdminTable title="服务端文件索引" count={`${records.length} 条记录`} headers={["类型", "大小", "更新时间"]}>
            {records.map((record) => (
              <div className="admin-table-row" key={`${record.userId}-${record.kind}-${record.updatedAt}`}>
                <span>
                  <strong>{record.kind}</strong>
                  <small>用户 {record.userId.slice(0, 8)}</small>
                </span>
                <span>{formatBytes(record.sizeBytes)}</span>
                <time>{formatDate(record.updatedAt)}</time>
              </div>
            ))}
          </AdminTable>
        </section>
      </section>
    </main>
  );
}

function AdminTopbar(props: { onBack: () => void; auth?: AuthUser; onSignOut?: () => Promise<void> }) {
  return (
    <header className="admin-page-topbar">
      <button className="admin-back-button" type="button" onClick={props.onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        工作台
      </button>
      <div className="admin-page-brand">
        <ServerCog size={18} aria-hidden="true" />
        <strong>ForgeDesk 管理端</strong>
      </div>
      {props.auth ? (
        <div className="admin-page-account">
          <span className="admin-account-avatar">
            {props.auth.avatarUrl ? (
              <img src={assetUrl(props.auth.avatarUrl)} alt="" />
            ) : (
              <UserRound size={15} aria-hidden="true" />
            )}
          </span>
          <strong>{props.auth.displayName}</strong>
          <button
            className="icon-button"
            type="button"
            onClick={() => void props.onSignOut?.()}
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <span />
      )}
    </header>
  );
}

function AdminSummary(props: { icon: typeof ServerCog; label: string; value: string; detail: string }) {
  const Icon = props.icon;
  return (
    <div className="admin-summary">
      <Icon size={17} aria-hidden="true" />
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </div>
  );
}

function AdminTable(props: { title: string; count: string; headers: string[]; children: React.ReactNode }) {
  return (
    <section className="admin-table-panel">
      <header>
        <div>
          <h2>{props.title}</h2>
          <p>{props.count}</p>
        </div>
      </header>
      <div className="admin-table">
        <div className="admin-table-head">
          {props.headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
        </div>
        {props.children}
      </div>
    </section>
  );
}
