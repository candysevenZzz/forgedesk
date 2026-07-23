import { useEffect, useState } from "react";
import { ArrowUpRight, Cloud, Database, HardDrive, Languages, RefreshCw, ShieldCheck, Workflow } from "lucide-react";
import { getPluginDataRoute, type RuntimeDataPolicy } from "./runtime-data-policy";
import type { PluginDefinition, RuntimeMode } from "./types";
import { loadWorkNotes, type WorkNotesArchive } from "./work-notes-storage";

type NotesOverview = { total: number; pending: number; days: number };

const emptyNotesOverview: NotesOverview = { total: 0, pending: 0, days: 0 };

function getNotesOverview(archive: WorkNotesArchive): NotesOverview {
  const notes = Object.values(archive.days).flat();
  return {
    total: notes.length,
    pending: notes.filter((note) => note.kind === "todo" && !note.completed).length,
    days: Object.keys(archive.days).length,
  };
}

function formatCheckedAt(checkedAt: string) {
  if (!checkedAt) {
    return "尚未检查";
  }
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) {
    return "刚刚检查";
  }
  return `检查于 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function PlatformHome(props: {
  activePlugin: PluginDefinition;
  plugins: PluginDefinition[];
  runtimeMode: RuntimeMode;
  serviceOnline: boolean;
  checkedAt: string;
  switchingMode: boolean;
  dataPolicy: RuntimeDataPolicy;
  onOpenPlugin: (pluginId: string) => void;
  onChangeRuntimeMode: (mode: RuntimeMode) => Promise<void>;
}) {
  const [notesOverview, setNotesOverview] = useState<NotesOverview>(emptyNotesOverview);
  const connected = props.runtimeMode === "connected";

  useEffect(() => {
    void loadWorkNotes().then((archive) => setNotesOverview(getNotesOverview(archive)));
  }, []);

  return (
    <section className="workspace-home">
      <section className="workspace-overview" aria-label="当前工作台">
        <div className="workspace-overview-copy">
          <span className="workspace-kicker">当前工作台</span>
          <h2>从一件正在做的事继续。</h2>
          <p>常用插件、数据流向和服务状态都在同一个入口里，切换运行模式会立即改变可用的数据路径。</p>
        </div>

        <button
          className={`continue-work accent-${props.activePlugin.accent}`}
          type="button"
          onClick={() => props.onOpenPlugin(props.activePlugin.id)}
        >
          <span className="continue-work-icon">
            <props.activePlugin.icon size={20} aria-hidden="true" />
          </span>
          <span className="continue-work-copy">
            <small>继续处理</small>
            <strong>{props.activePlugin.name}</strong>
            <em>{props.activePlugin.description}</em>
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </button>
      </section>

      <section className={`runtime-policy-bar ${connected ? "connected" : "local"}`} aria-label="运行模式与数据策略">
        <div className="runtime-policy-icon">
          {connected ? <Cloud size={20} aria-hidden="true" /> : <HardDrive size={20} aria-hidden="true" />}
        </div>
        <div className="runtime-policy-copy">
          <span>数据策略</span>
          <strong>{props.dataPolicy.title}</strong>
          <p>{props.dataPolicy.summary}</p>
        </div>
        <div className="runtime-policy-meta">
          <span className={props.serviceOnline ? "policy-health online" : "policy-health"}>
            {props.dataPolicy.status}
          </span>
          <small>{formatCheckedAt(props.checkedAt)}</small>
        </div>
        <div className="home-mode-switch" role="group" aria-label="首页运行模式">
          <button
            className={!connected ? "selected" : ""}
            type="button"
            onClick={() => void props.onChangeRuntimeMode("local")}
            disabled={props.switchingMode}
          >
            <HardDrive size={14} aria-hidden="true" />
            本地
          </button>
          <button
            className={connected ? "selected" : ""}
            type="button"
            onClick={() => void props.onChangeRuntimeMode("connected")}
            disabled={props.switchingMode}
          >
            <Cloud size={14} aria-hidden="true" />
            服务
          </button>
        </div>
      </section>

      <section className="workspace-home-grid">
        <section className="home-launch-panel">
          <div className="home-panel-head">
            <div>
              <span>常用入口</span>
              <h2>打开一个插件，直接开始</h2>
            </div>
            <strong>{props.plugins.length} 个插件</strong>
          </div>
          <div className="home-plugin-list">
            {props.plugins.map((plugin) => {
              const Icon = plugin.icon;
              return (
                <button
                  className={`home-plugin-row accent-${plugin.accent}`}
                  key={plugin.id}
                  type="button"
                  onClick={() => props.onOpenPlugin(plugin.id)}
                >
                  <span className="home-plugin-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="home-plugin-copy">
                    <strong>{plugin.name}</strong>
                    <em>{plugin.description}</em>
                  </span>
                  <span className="home-plugin-route">{getPluginDataRoute(plugin, props.runtimeMode)}</span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <section className="home-data-panel">
          <div className="home-panel-head">
            <div>
              <span>数据流向</span>
              <h2>模式决定实际行为</h2>
            </div>
            <Workflow size={19} aria-hidden="true" />
          </div>
          <div className="data-flow-list">
            <div className="data-flow-row">
              <HardDrive size={17} aria-hidden="true" />
              <div>
                <strong>工作笔记</strong>
                <p>{props.dataPolicy.notesBehavior}</p>
              </div>
            </div>
            <div className="data-flow-row">
              <Languages size={17} aria-hidden="true" />
              <div>
                <strong>第三方翻译</strong>
                <p>{props.dataPolicy.translationBehavior}</p>
              </div>
            </div>
            <div className="data-flow-row">
              <Database size={17} aria-hidden="true" />
              <div>
                <strong>开发工具与日志</strong>
                <p>JSON、文本、时间、JWT、Diff、定时器和日志解析始终只在本机完成。</p>
              </div>
            </div>
          </div>
          <div className="home-data-summary">
            <div>
              <span>笔记记录</span>
              <strong>{notesOverview.total}</strong>
              <small>{notesOverview.days} 天归档</small>
            </div>
            <div>
              <span>待办未完成</span>
              <strong>{notesOverview.pending}</strong>
              <small>本机数据</small>
            </div>
            <div>
              <span>同步状态</span>
              <strong>{connected ? (props.serviceOnline ? "就绪" : "异常") : "关闭"}</strong>
              <small>{connected ? "仅笔记参与同步" : "切换服务模式开启"}</small>
            </div>
          </div>
          {connected ? (
            <button className="home-sync-hint" type="button" onClick={() => props.onOpenPlugin("work-notes")}>
              <RefreshCw size={15} aria-hidden="true" />
              前往工作笔记查看同步记录
            </button>
          ) : (
            <div className="home-local-hint">
              <ShieldCheck size={15} aria-hidden="true" />
              本地模式下不会调用后端或第三方服务
            </div>
          )}
        </section>
      </section>
    </section>
  );
}
