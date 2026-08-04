import { useEffect, useRef, useState } from "react";
import {
  Anvil,
  ChevronDown,
  Cloud,
  Command,
  HardDrive,
  Home,
  LogIn,
  LogOut,
  Search,
  ServerCog,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { AdminPage } from "./admin-page";
import {
  assetUrl,
  fetchCurrentUser,
  fetchHealth,
  getApiBaseUrl,
  logoutAccount,
  normalizeApiBaseUrl,
  setApiBaseUrl,
  setAccessToken,
  type AuthResult,
  type AuthUser,
} from "./api";
import { AuthDialog } from "./auth-dialog";
import { ProfileDialog } from "./profile-dialog";
import { loadSessionToken, saveSessionToken } from "./auth-storage";
import { PlatformHome } from "./platform-home";
import { plugins } from "./plugins";
import { getRuntimeDataPolicy } from "./runtime-data-policy";
import { loadRuntimeSettings, saveRuntimeSettings } from "./runtime-settings-storage";
import type { PluginDefinition, RuntimeMode } from "./types";

const ACTIVE_PLUGIN_STORAGE_KEY = "forgedesk-active-plugin-v1";

function savedPluginId() {
  const requestedPlugin = new URLSearchParams(window.location.search).get("plugin");
  const value = requestedPlugin || localStorage.getItem(ACTIVE_PLUGIN_STORAGE_KEY);
  return value === "__home" || (value && plugins.some((plugin) => plugin.id === value)) ? value : "developer-toolbox";
}

function CommandPalette(props: {
  plugins: PluginDefinition[];
  onClose: () => void;
  onOpenHome: () => void;
  onOpenPlugin: (pluginId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = props.plugins.filter((plugin) => {
    const haystack = `${plugin.name} ${plugin.description} ${plugin.shortcuts.join(" ")}`.toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function selectPlugin(pluginId: string) {
    props.onOpenPlugin(pluginId);
    props.onClose();
  }

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>快速切换</span>
            <h2 id="command-palette-title">命令面板</h2>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} data-tooltip="关闭" aria-label="关闭">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <label className="command-palette-search">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                props.onClose();
              }
            }}
            placeholder="搜索插件"
            aria-label="搜索插件"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-palette-list">
          <button className="command-palette-item" type="button" onClick={props.onOpenHome}>
            <span className="command-palette-icon home">
              <Home size={17} aria-hidden="true" />
            </span>
            <span>
              <strong>平台首页</strong>
              <small>返回当前工作台</small>
            </span>
          </button>
          {matches.map((plugin) => {
            const Icon = plugin.icon;
            return (
              <button
                className="command-palette-item"
                key={plugin.id}
                type="button"
                onClick={() => selectPlugin(plugin.id)}
              >
                <span className={`command-palette-icon accent-${plugin.accent}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <strong>{plugin.name}</strong>
                  <small>{plugin.description}</small>
                </span>
              </button>
            );
          })}
          {!matches.length ? <p className="command-palette-empty">没有匹配的插件</p> : null}
        </div>
      </section>
    </div>
  );
}

function AccountMenu(props: {
  user: AuthUser;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeWhenOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openProfile() {
    setOpen(false);
    props.onOpenProfile();
  }

  function openAdmin() {
    setOpen(false);
    props.onOpenAdmin();
  }

  function signOut() {
    setOpen(false);
    props.onSignOut();
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="account-profile"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar">
          {props.user.avatarUrl ? (
            <img src={assetUrl(props.user.avatarUrl)} alt="" />
          ) : (
            <UserRound size={16} aria-hidden="true" />
          )}
        </span>
        <span className="account-profile-copy">
          <strong>{props.user.displayName}</strong>
          <small>{props.user.role === "ADMIN" ? "管理员" : "已登录"}</small>
        </span>
        <ChevronDown
          size={15}
          className={open ? "account-menu-chevron open" : "account-menu-chevron"}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="account-menu-popover" role="menu" aria-label="账户菜单">
          <div className="account-menu-summary">
            <span className="account-menu-avatar">
              {props.user.avatarUrl ? (
                <img src={assetUrl(props.user.avatarUrl)} alt="" />
              ) : (
                <UserRound size={21} aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{props.user.displayName}</strong>
              <small>@{props.user.username}</small>
              <em>{props.user.role === "ADMIN" ? "管理员" : "普通用户"}</em>
            </span>
          </div>
          <div className="account-menu-actions">
            <button type="button" role="menuitem" onClick={openProfile}>
              <UserRound size={16} aria-hidden="true" />
              个人资料
            </button>
            {props.user.role === "ADMIN" ? (
              <button type="button" role="menuitem" onClick={openAdmin}>
                <ServerCog size={16} aria-hidden="true" />
                管理端
              </button>
            ) : null}
          </div>
          <div className="account-menu-actions account-menu-danger">
            <button type="button" role="menuitem" onClick={signOut}>
              <LogOut size={16} aria-hidden="true" />
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BackendSettingsDialog(props: {
  initialUrl: string;
  onSave: (url: string) => Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(props.initialUrl);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await props.onSave(url);
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "后端地址保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="backend-settings-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="backend-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backend-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>服务连接</span>
            <h2 id="backend-settings-title">后端地址</h2>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="关闭">
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <label>
          <span>API 服务地址</span>
          <input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="http://127.0.0.1:8080 或 http://服务器公网 IP"
            inputMode="url"
          />
        </label>
        <p>开发时可使用本机地址；DMG 中填写部署后的公网地址。更换地址会退出当前服务的登录状态。</p>
        {error ? <strong className="backend-settings-error">{error}</strong> : null}
        <footer>
          <button type="button" onClick={() => setUrl("http://127.0.0.1:8080")}>
            使用本机开发服务
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "正在验证..." : "保存并连接"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function App() {
  const [activePluginId, setActivePluginId] = useState<string>(savedPluginId);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("local");
  const [serviceOnline, setServiceOnline] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const [modeStatus, setModeStatus] = useState("本地运行，不会连接服务");
  const [switchingMode, setSwitchingMode] = useState(false);
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isAdminPage, setIsAdminPage] = useState(() => window.location.hash === "#/admin");
  const [backendBaseUrl, setBackendBaseUrl] = useState(getApiBaseUrl);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showBackendSettings, setShowBackendSettings] = useState(false);

  const visiblePlugins = plugins;
  const activePlugin = visiblePlugins.find((plugin) => plugin.id === activePluginId) ?? visiblePlugins[0];
  const ActivePluginComponent = activePlugin.component;
  const dataPolicy = getRuntimeDataPolicy(runtimeMode, serviceOnline);

  useEffect(() => {
    localStorage.setItem(ACTIVE_PLUGIN_STORAGE_KEY, activePluginId);
  }, [activePluginId]);

  useEffect(() => {
    void loadRuntimeSettings().then((settings) => {
      const configuredUrl = settings.apiBaseUrl || getApiBaseUrl();
      setApiBaseUrl(configuredUrl);
      setBackendBaseUrl(configuredUrl);
      setSettingsLoaded(true);
      if (settings.mode === "connected" && configuredUrl) {
        void changeRuntimeMode("connected", configuredUrl);
      }
    });
  }, []);

  useEffect(() => {
    const onHashChange = () => setIsAdminPage(window.location.hash === "#/admin");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isAdminPage) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdminPage]);

  useEffect(() => {
    if (!settingsLoaded || !backendBaseUrl) {
      return;
    }
    void loadSessionToken().then(async (token) => {
      if (!token) {
        return;
      }
      setAccessToken(token);
      try {
        setAuth(await fetchCurrentUser());
      } catch {
        setAccessToken("");
        await saveSessionToken("");
      }
    });
  }, [backendBaseUrl, settingsLoaded]);

  async function handleAuthenticated(result: AuthResult) {
    setAccessToken(result.token);
    await saveSessionToken(result.token);
    setAuth(result.user);
    setShowAuthDialog(false);
  }

  async function signOut() {
    try {
      await logoutAccount();
    } catch {
      // Local session cleanup must still complete when the service is unavailable.
    }
    setAccessToken("");
    await saveSessionToken("");
    setAuth(null);
  }

  function openAdminPage() {
    window.location.hash = "/admin";
  }

  function closeAdminPage() {
    window.location.hash = "/";
  }

  async function changeRuntimeMode(mode: RuntimeMode, targetBaseUrl = backendBaseUrl) {
    if (mode === "local") {
      setRuntimeMode("local");
      setServiceOnline(false);
      setCheckedAt("");
      setModeStatus("本地运行，不会连接服务");
      await saveRuntimeSettings({ mode: "local", apiBaseUrl: targetBaseUrl });
      return;
    }

    if (!targetBaseUrl) {
      setModeStatus("请先设置后端服务地址");
      setShowBackendSettings(true);
      return;
    }

    setSwitchingMode(true);
    setModeStatus("正在验证服务连接...");
    try {
      setApiBaseUrl(targetBaseUrl);
      const health = await fetchHealth();
      setRuntimeMode("connected");
      setServiceOnline(health.status === "ok");
      setCheckedAt(health.checkedAt);
      setModeStatus("服务已连接，数据按策略处理");
      await saveRuntimeSettings({ mode: "connected", apiBaseUrl: targetBaseUrl });
    } catch {
      setRuntimeMode("local");
      setServiceOnline(false);
      setCheckedAt("");
      setModeStatus("服务不可用，已保持本地运行");
      await saveRuntimeSettings({ mode: "local", apiBaseUrl: targetBaseUrl });
    } finally {
      setSwitchingMode(false);
    }
  }

  async function saveBackendSettings(value: string) {
    const targetBaseUrl = normalizeApiBaseUrl(value);
    if (!targetBaseUrl) {
      throw new Error("请填写后端服务地址");
    }
    setApiBaseUrl(targetBaseUrl);
    setBackendBaseUrl(targetBaseUrl);
    setAccessToken("");
    await saveSessionToken("");
    setAuth(null);
    await changeRuntimeMode("connected", targetBaseUrl);
  }

  const content = isAdminPage ? (
    <AdminPage auth={auth} onOpenLogin={() => setShowAuthDialog(true)} onBack={closeAdminPage} onSignOut={signOut} />
  ) : (
    <main className="platform-shell">
      <aside className="platform-sidebar" aria-label="平台导航">
        <div className="brand">
          <div className="brand-mark">
            <Anvil size={20} aria-hidden="true" />
          </div>
          <div>
            <strong>Forge</strong>
            <span>Plugin Platform</span>
          </div>
        </div>

        <button
          className="command-prompt"
          type="button"
          onClick={() => setShowCommandPalette(true)}
          aria-label="打开命令面板"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={16} aria-hidden="true" />
          <span>搜索或切换插件</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="sidebar-section">
          <button
            className={`nav-item ${activePluginId === "__home" ? "active" : ""}`}
            type="button"
            onClick={() => setActivePluginId("__home")}
          >
            <Home size={18} aria-hidden="true" />
            <span>平台首页</span>
          </button>
        </nav>

        <div className="sidebar-group">
          <p className="sidebar-group-title">插件</p>
          <div className="plugin-nav-list">
            {visiblePlugins.map((plugin) => {
              const Icon = plugin.icon;
              return (
                <button
                  className={`nav-item ${activePluginId === plugin.id ? "active" : ""}`}
                  key={plugin.id}
                  type="button"
                  onClick={() => setActivePluginId(plugin.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{plugin.name}</span>
                  <i
                    className={`plugin-service-dot ${plugin.serviceRequirement}`}
                    data-tooltip={
                      plugin.serviceRequirement === "local"
                        ? "纯本地"
                        : plugin.serviceRequirement === "sync"
                          ? "本地优先，可同步"
                          : "本地优先，按需服务"
                    }
                    aria-label={
                      plugin.serviceRequirement === "local"
                        ? "纯本地"
                        : plugin.serviceRequirement === "sync"
                          ? "本地优先，可同步"
                          : "本地优先，按需服务"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="runtime-footer-head">
            <span>运行模式</span>
            <button type="button" onClick={() => setShowBackendSettings(true)} aria-label="配置后端服务地址">
              <Settings2 size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="runtime-mode-switch" role="group" aria-label="运行模式">
            <button
              className={runtimeMode === "local" ? "selected" : ""}
              type="button"
              onClick={() => void changeRuntimeMode("local")}
              disabled={switchingMode}
            >
              <HardDrive size={14} aria-hidden="true" />
              本地
            </button>
            <button
              className={runtimeMode === "connected" ? "selected" : ""}
              type="button"
              onClick={() => void changeRuntimeMode("connected")}
              disabled={switchingMode}
            >
              <Cloud size={14} aria-hidden="true" />
              服务
            </button>
          </div>
          <strong className={serviceOnline ? "online" : ""}>{modeStatus}</strong>
        </div>
      </aside>

      <section className="platform-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">插件运行平台</p>
            <h1>{activePluginId === "__home" ? "平台首页" : activePlugin.name}</h1>
          </div>
          <div className="topbar-account">
            {auth ? (
              <AccountMenu
                user={auth}
                onOpenProfile={() => setShowProfileDialog(true)}
                onOpenAdmin={openAdminPage}
                onSignOut={() => void signOut()}
              />
            ) : (
              <button className="topbar-login" type="button" onClick={() => setShowAuthDialog(true)}>
                <LogIn size={16} aria-hidden="true" />
                登录
              </button>
            )}
          </div>
        </header>

        {activePluginId === "__home" ? (
          <PlatformHome
            activePlugin={activePlugin}
            plugins={visiblePlugins}
            onOpenPlugin={setActivePluginId}
            runtimeMode={runtimeMode}
            serviceOnline={serviceOnline}
            checkedAt={checkedAt}
            switchingMode={switchingMode}
            onChangeRuntimeMode={changeRuntimeMode}
            dataPolicy={dataPolicy}
          />
        ) : (
          <ActivePluginComponent
            context={{
              runtimeMode,
              serviceOnline,
              checkedAt,
              auth,
            }}
          />
        )}
      </section>
    </main>
  );

  return (
    <>
      {content}
      {showAuthDialog ? (
        <AuthDialog
          onAuthenticated={(result) => void handleAuthenticated(result)}
          onClose={() => setShowAuthDialog(false)}
        />
      ) : null}
      {showProfileDialog && auth ? (
        <ProfileDialog user={auth} onUpdated={setAuth} onClose={() => setShowProfileDialog(false)} />
      ) : null}
      {showCommandPalette && !isAdminPage ? (
        <CommandPalette
          plugins={visiblePlugins}
          onClose={() => setShowCommandPalette(false)}
          onOpenHome={() => {
            setActivePluginId("__home");
            setShowCommandPalette(false);
          }}
          onOpenPlugin={setActivePluginId}
        />
      ) : null}
      {showBackendSettings ? (
        <BackendSettingsDialog
          initialUrl={backendBaseUrl}
          onSave={saveBackendSettings}
          onClose={() => setShowBackendSettings(false)}
        />
      ) : null}
    </>
  );
}

export default App;
