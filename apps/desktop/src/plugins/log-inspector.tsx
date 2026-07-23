import { useMemo, useState } from "react";
import { AlertTriangle, FileSearch2, Sparkles } from "lucide-react";
import type { PluginDefinition } from "../types";

const sampleLog = `[2026-06-11 09:48:13.219] INFO  order-service traceId=6fd201 req=/api/order/create userId=1024 begin create order
[2026-06-11 09:48:13.426] WARN  stock-service traceId=6fd201 skuId=SPU-991 lock stock retry=1 timeout
[2026-06-11 09:48:13.637] ERROR order-service traceId=6fd201 errorCode=ORDER_CREATE_FAIL message=downstream timeout in stock-service
[2026-06-11 09:48:13.639] INFO  gateway traceId=6fd201 cost=420ms status=500`;

function LogInspectorPlugin() {
  const [keyword, setKeyword] = useState("traceId=6fd201");
  const [rawLog, setRawLog] = useState(sampleLog);

  const lines = useMemo(() => rawLog.split("\n").filter(Boolean), [rawLog]);
  const filteredLines = useMemo(() => {
    if (!keyword.trim()) {
      return lines;
    }

    const normalized = keyword.trim().toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(normalized));
  }, [keyword, lines]);

  const summary = useMemo(() => {
    const errorCount = filteredLines.filter((line) => line.includes("ERROR")).length;
    const warnCount = filteredLines.filter((line) => line.includes("WARN")).length;
    const traceMatch = filteredLines.find((line) => line.includes("traceId="))?.match(/traceId=([^\s]+)/)?.[1] ?? "--";

    return {
      errorCount,
      warnCount,
      traceId: traceMatch,
    };
  }, [filteredLines]);

  return (
    <section className="plugin-shell">
      <div className="plugin-header">
        <div>
          <p className="section-label">日志分析插件</p>
          <h2>先把一段日志快速压成可读结论</h2>
        </div>
        <div className="plugin-meta">
          <span>{filteredLines.length} lines</span>
          <span>{summary.traceId}</span>
        </div>
      </div>

      <div className="log-toolbar">
        <label className="field-shell">
          <span>关键词</span>
          <input
            className="text-field"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="traceId / errorCode / service"
          />
        </label>
      </div>

      <div className="plugin-grid">
        <section className="editor-panel">
          <div className="panel-title">
            <FileSearch2 size={18} aria-hidden="true" />
            <strong>原始日志</strong>
          </div>
          <textarea
            className="log-editor"
            value={rawLog}
            onChange={(event) => setRawLog(event.target.value)}
            spellCheck={false}
          />
        </section>

        <section className="insight-panel">
          <div className="panel-title">
            <Sparkles size={18} aria-hidden="true" />
            <strong>快速结论</strong>
          </div>

          <div className="insight-cards">
            <div className="insight-card">
              <span>ERROR</span>
              <strong>{summary.errorCount}</strong>
            </div>
            <div className="insight-card">
              <span>WARN</span>
              <strong>{summary.warnCount}</strong>
            </div>
            <div className="insight-card">
              <span>Trace</span>
              <strong>{summary.traceId}</strong>
            </div>
          </div>

          <div className="callout-card">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>当前样例里最像主因的是 `stock-service` 超时，`order-service` 是被下游拖挂的结果。</p>
          </div>

          <div className="result-list">
            {filteredLines.map((line, index) => (
              <pre className="result-line" key={`${index}-${line}`}>
                {line}
              </pre>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export const logInspectorPlugin: PluginDefinition = {
  id: "log-inspector",
  name: "日志分析",
  description: "粘贴日志后快速过滤、缩小范围，并先得到一个粗判断。",
  icon: FileSearch2,
  category: "排障",
  shortcuts: ["traceId", "error", "timeout"],
  accent: "teal",
  serviceRequirement: "local",
  component: LogInspectorPlugin,
};
