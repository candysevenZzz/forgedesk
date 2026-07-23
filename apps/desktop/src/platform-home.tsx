import { Blocks, HardDrive, Search, ShieldCheck } from "lucide-react";
import type { PluginDefinition } from "./types";

function serviceRequirementLabel(plugin: PluginDefinition) {
  if (plugin.serviceRequirement === "local") return "纯本地";
  if (plugin.serviceRequirement === "sync") return "本地优先 · 可同步";
  return "本地优先 · 按需服务";
}

export function PlatformHome(props: {
  activePlugin: PluginDefinition;
  plugins: PluginDefinition[];
  onOpenPlugin: (pluginId: string) => void;
}) {
  return (
    <section className="platform-home">
      <section className="platform-hero">
        <div className="platform-hero-copy">
          <p className="eyebrow">研发插件平台</p>
          <h1>把高频工作收成插件，让平台只做唤起与协作。</h1>
          <p>
            这不是再做一个通用工具箱，而是给后端研发工作流一个统一容器。插件可以独立激活运行，平台负责入口、状态和上下文。
          </p>
        </div>

        <div className="hero-status-stack">
          <div className="status-card">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <span>数据策略</span>
              <strong>本机优先</strong>
            </div>
          </div>
          <div className="status-card">
            <HardDrive size={18} aria-hidden="true" />
            <div>
              <span>工作笔记</span>
              <strong>本地文件</strong>
            </div>
          </div>
          <div className="status-card">
            <Blocks size={18} aria-hidden="true" />
            <div>
              <span>当前插件</span>
              <strong>{props.activePlugin.name}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="home-grid">
        <section className="plugin-gallery">
          <div className="section-head">
            <p className="section-label">内置插件</p>
            <h2>先把最常用的一组能力跑起来</h2>
          </div>

          <div className="plugin-card-grid">
            {props.plugins.map((plugin) => {
              const Icon = plugin.icon;
              return (
                <button
                  className={`plugin-card accent-${plugin.accent}`}
                  key={plugin.id}
                  type="button"
                  onClick={() => props.onOpenPlugin(plugin.id)}
                >
                  <div className="plugin-card-head">
                    <div className="plugin-card-icon">
                      <Icon size={18} aria-hidden="true" />
                    </div>
                    <div className="plugin-card-badges"><span>{plugin.category}</span><span className={`plugin-service-badge ${plugin.serviceRequirement}`}>{serviceRequirementLabel(plugin)}</span></div>
                  </div>
                  <strong>{plugin.name}</strong>
                  <p>{plugin.description}</p>
                  <div className="shortcut-row">
                    {plugin.shortcuts.map((shortcut) => (
                      <span className="shortcut-chip" key={shortcut}>
                        {shortcut}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="home-side-panel">
          <div className="section-head">
            <p className="section-label">平台职责</p>
            <h2>别把平台做成插件本身</h2>
          </div>
          <div className="platform-rule-list">
            <div className="platform-rule">
              <Search size={16} aria-hidden="true" />
              <p>统一入口：命令面板、首页卡片、后续全局唤起</p>
            </div>
            <div className="platform-rule">
              <Blocks size={16} aria-hidden="true" />
              <p>插件隔离：每个插件自己负责功能，平台不侵入业务细节</p>
            </div>
            <div className="platform-rule">
              <ShieldCheck size={16} aria-hidden="true" />
              <p>统一状态：环境、配置、最近使用状态后续都能下沉到平台层</p>
            </div>
          </div>
        </section>
      </section>
    </section>
  );
}
