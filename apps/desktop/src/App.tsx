import { useEffect, useState } from "react";
import { Anvil, Cloud, HardDrive, Home, LogIn, LogOut, Search, ShieldCheck, ServerCog, UserRound } from "lucide-react";
import { AdminPage } from "./admin-page";
import {
  assetUrl,
  fetchCurrentUser,
  fetchHealth,
  logoutAccount,
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
  const [isAdminPage, setIsAdminPage] = useState(() => window.location.hash === "#/admin");

  const visiblePlugins = plugins;
  const activePlugin = visiblePlugins.find((plugin) => plugin.id === activePluginId) ?? visiblePlugins[0];
  const ActivePluginComponent = activePlugin.component;
  const dataPolicy = getRuntimeDataPolicy(runtimeMode, serviceOnline);

  useEffect(() => {
    localStorage.setItem(ACTIVE_PLUGIN_STORAGE_KEY, activePluginId);
  }, [activePluginId]);

  useEffect(() => {
    void loadRuntimeSettings().then((settings) => {
      if (settings.mode === "connected") {
        void changeRuntimeMode("connected");
      }
    });
  }, []);

  useEffect(() => {
    const onHashChange = () => setIsAdminPage(window.location.hash === "#/admin");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
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
  }, []);

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

  async function changeRuntimeMode(mode: RuntimeMode) {
    if (mode === "local") {
      setRuntimeMode("local");
      setServiceOnline(false);
      setCheckedAt("");
      setModeStatus("本地运行，不会连接服务");
      await saveRuntimeSettings({ mode: "local" });
      return;
    }

    setSwitchingMode(true);
    setModeStatus("正在验证服务连接...");
    try {
      const health = await fetchHealth();
      setRuntimeMode("connected");
      setServiceOnline(health.status === "ok");
      setCheckedAt(health.checkedAt);
      setModeStatus("服务已连接，数据按策略处理");
      await saveRuntimeSettings({ mode: "connected" });
    } catch {
      setRuntimeMode("local");
      setServiceOnline(false);
      setCheckedAt("");
      setModeStatus("服务不可用，已保持本地运行");
      await saveRuntimeSettings({ mode: "local" });
    } finally {
      setSwitchingMode(false);
    }
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

        <div className="command-prompt">
          <Search size={16} aria-hidden="true" />
          <span>命令面板即将接入</span>
        </div>

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
                  className={`nav-item ${activePlugin.id === plugin.id ? "active" : ""}`}
                  key={plugin.id}
                  type="button"
                  onClick={() => setActivePluginId(plugin.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{plugin.name}</span>
                  <i
                    className={`plugin-service-dot ${plugin.serviceRequirement}`}
                    title={
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
          <span>运行模式</span>
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
              <>
                <button
                  className="account-profile"
                  type="button"
                  onClick={() => setShowProfileDialog(true)}
                  title="个人资料"
                >
                  <span className="account-avatar">
                    {auth.avatarUrl ? (
                      <img src={assetUrl(auth.avatarUrl)} alt="" />
                    ) : (
                      <UserRound size={15} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <ShieldCheck size={15} aria-hidden="true" />
                    <strong>{auth.displayName}</strong>
                    <small>{auth.role === "ADMIN" ? "管理员" : "已登录"}</small>
                  </span>
                </button>
                {auth.role === "ADMIN" ? (
                  <button
                    className="icon-button"
                    type="button"
                    onClick={openAdminPage}
                    title="打开管理端"
                    aria-label="打开管理端"
                  >
                    <ServerCog size={16} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => void signOut()}
                  title="退出登录"
                  aria-label="退出登录"
                >
                  <LogOut size={16} aria-hidden="true" />
                </button>
              </>
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
    </>
  );
}

export default App;
