import { useEffect, useState } from "react";
import { Blocks, Cloud, HardDrive, Home, Search } from "lucide-react";
import { fetchHealth } from "./api";
import { PlatformHome } from "./platform-home";
import { plugins } from "./plugins";
import { loadRuntimeSettings, saveRuntimeSettings } from "./runtime-settings-storage";
import type { PluginDefinition, RuntimeMode } from "./types";

function App() {
  const [activePluginId, setActivePluginId] = useState<string>("developer-toolbox");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("local");
  const [serviceOnline, setServiceOnline] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const [modeStatus, setModeStatus] = useState("本地运行，不会连接服务");
  const [switchingMode, setSwitchingMode] = useState(false);

  const activePlugin = plugins.find((plugin) => plugin.id === activePluginId) ?? plugins[0];
  const ActivePluginComponent = activePlugin.component;

  useEffect(() => {
    void loadRuntimeSettings().then((settings) => {
      if (settings.mode === "connected") void changeRuntimeMode("connected");
    });
  }, []);

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
      setModeStatus("服务已连接，本地数据会按需同步");
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

  return (
    <main className="platform-shell">
      <aside className="platform-sidebar" aria-label="平台导航">
        <div className="brand">
          <div className="brand-mark">
            <Blocks size={22} aria-hidden="true" />
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
            {plugins.map((plugin) => {
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
                  <i className={`plugin-service-dot ${plugin.serviceRequirement}`} title={plugin.serviceRequirement === "local" ? "纯本地" : plugin.serviceRequirement === "sync" ? "本地优先，可同步" : "本地优先，按需服务"} aria-label={plugin.serviceRequirement === "local" ? "纯本地" : plugin.serviceRequirement === "sync" ? "本地优先，可同步" : "本地优先，按需服务"} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          <span>运行模式</span>
          <div className="runtime-mode-switch" role="group" aria-label="运行模式">
            <button className={runtimeMode === "local" ? "selected" : ""} type="button" onClick={() => void changeRuntimeMode("local")} disabled={switchingMode}>
              <HardDrive size={14} aria-hidden="true" />本地
            </button>
            <button className={runtimeMode === "connected" ? "selected" : ""} type="button" onClick={() => void changeRuntimeMode("connected")} disabled={switchingMode}>
              <Cloud size={14} aria-hidden="true" />服务
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
        </header>

        {activePluginId === "__home" ? (
          <PlatformHome
            activePlugin={activePlugin}
            plugins={plugins}
            onOpenPlugin={setActivePluginId}
          />
        ) : (
          <ActivePluginComponent
            context={{
              runtimeMode,
              serviceOnline,
              checkedAt,
            }}
          />
        )}
      </section>
    </main>
  );
}

export default App;
