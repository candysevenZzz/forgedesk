import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Braces,
  Check,
  Clipboard,
  Clock3,
  Diff,
  Eraser,
  KeyRound,
  Languages,
  ListOrdered,
  Rows3,
  Send,
  Settings2,
  TableProperties,
  Timer,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { translateText, type TranslationCredentials, type TranslationProvider } from "../api";
import type { PluginContext, PluginDefinition } from "../types";

type ToolId = "json" | "timestamp" | "timer" | "jwt" | "diff" | "text" | "translate";
type JsonMode = "pretty" | "compact";
type TextOutputMode = "lines" | "csv" | "sql";

const tools: Array<{ id: ToolId; label: string; description: string; icon: typeof Braces; requiresService?: boolean }> = [
  { id: "json", label: "JSON 格式化", description: "格式化、压缩并校验 JSON 内容", icon: Braces },
  { id: "timestamp", label: "时间戳转换", description: "秒、毫秒与日期格式互转", icon: Clock3 },
  { id: "timer", label: "定时器", description: "计时、目标倒计时与提前提醒", icon: Timer },
  { id: "jwt", label: "JWT 解析", description: "读取 Header 与 Payload，不上传 Token", icon: KeyRound },
  { id: "diff", label: "文本对比", description: "比较文本或 JSON，并可排序两侧内容", icon: Diff },
  { id: "text", label: "文本与 ID", description: "拆分、去重并组合一组标识符", icon: Rows3 },
  { id: "translate", label: "文本翻译", description: "通过已连接服务调用第三方翻译厂商", icon: Languages, requiresService: true },
];

const translationProviders: Array<{
  id: TranslationProvider;
  label: string;
  credentialFields: Array<{ key: keyof TranslationCredentials; label: string; placeholder: string }>;
}> = [
  {
    id: "baidu",
    label: "百度翻译",
    credentialFields: [
      { key: "appId", label: "App ID", placeholder: "百度翻译 App ID" },
      { key: "appKey", label: "App Key", placeholder: "百度翻译密钥" },
    ],
  },
  {
    id: "youdao",
    label: "有道智云",
    credentialFields: [
      { key: "appKey", label: "App Key", placeholder: "有道应用 App Key" },
      { key: "appSecret", label: "App Secret", placeholder: "有道应用 App Secret" },
    ],
  },
  {
    id: "google",
    label: "Google Cloud",
    credentialFields: [
      { key: "appKey", label: "API Key", placeholder: "Google Cloud Translation API Key" },
    ],
  },
  {
    id: "alibaba",
    label: "阿里云机器翻译",
    credentialFields: [
      { key: "appId", label: "AccessKey ID", placeholder: "阿里云 AccessKey ID" },
      { key: "appKey", label: "AccessKey Secret", placeholder: "阿里云 AccessKey Secret" },
    ],
  },
];

const emptyCredentials: TranslationCredentials = { appId: "", appKey: "", appSecret: "" };

const timeZones = [
  { id: "Asia/Shanghai", label: "东八区（上海）" },
  { id: "UTC", label: "UTC" },
  { id: "Asia/Tokyo", label: "东九区（东京）" },
  { id: "Europe/London", label: "伦敦" },
  { id: "America/New_York", label: "纽约" },
];

const sampleJson = `{
  "requestId": "req_20260722_001",
  "user": { "id": 1024, "name": "Candy" },
  "enabled": true
}`;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function formatJson(value: string, mode: JsonMode) {
  try {
    const parsed = JSON.parse(value);
    return { output: JSON.stringify(parsed, null, mode === "pretty" ? 2 : undefined), error: "" };
  } catch (error) {
    return { output: "", error: error instanceof Error ? error.message : "JSON 解析失败" };
  }
}

function parseJwt(value: string) {
  const token = value.trim().replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { header: "", payload: "", error: "JWT 应由 Header.Payload.Signature 三段组成" };
  }

  try {
    return {
      header: JSON.stringify(JSON.parse(decodeBase64Url(parts[0])), null, 2),
      payload: JSON.stringify(JSON.parse(decodeBase64Url(parts[1])), null, 2),
      error: "",
    };
  } catch {
    return { header: "", payload: "", error: "Header 或 Payload 不是可解析的 Base64URL JSON" };
  }
}

function formatDate(value: number, timeZone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

function timeZoneOffset(timeZone: string, timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - timestamp;
}

function parseDateInTimeZone(value: string, timeZone: string) {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return Date.parse(value);
  const utcGuess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0));
  let timestamp = utcGuess;
  for (let attempt = 0; attempt < 2; attempt += 1) timestamp = utcGuess - timeZoneOffset(timeZone, timestamp);
  return timestamp;
}

function timestampResult(value: string, timeZone: string) {
  const input = value.trim();
  if (!input) {
    return { timestamp: "", iso: "", local: "", error: "" };
  }

  const numeric = Number(input);
  const milliseconds = Number.isFinite(numeric)
    ? Math.abs(numeric) < 100_000_000_000
      ? numeric * 1000
      : numeric
    : parseDateInTimeZone(input, timeZone);

  if (!Number.isFinite(milliseconds) || Number.isNaN(milliseconds)) {
    return { timestamp: "", iso: "", local: "", error: "请输入有效的 Unix 时间戳或可识别日期" };
  }

  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return { timestamp: "", iso: "", local: "", error: "日期超出可处理范围" };
  }

  return {
    timestamp: String(Math.floor(milliseconds)),
    iso: date.toISOString(),
    local: formatDate(milliseconds, timeZone),
    error: "",
  };
}

type DiffState = "same" | "added" | "removed" | "changed";

type DiffRow = {
  left?: string;
  right?: string;
  leftNumber?: number;
  rightNumber?: number;
  state: DiffState;
};

function toLines(value: string) {
  return value ? value.replace(/\r\n/g, "\n").split("\n") : [];
}

function normalizeCompareValue(value: string, mode: "text" | "json") {
  if (mode === "text") return { value, error: "" };
  if (!value.trim()) return { value: "", error: "" };
  try {
    return { value: JSON.stringify(JSON.parse(value), null, 2), error: "" };
  } catch (error) {
    return { value: "", error: error instanceof Error ? error.message : "JSON 解析失败" };
  }
}

function compareLines(leftSource: string, rightSource: string): DiffRow[] {
  const left = toLines(leftSource);
  const right = toLines(rightSource);
  const maxExactLines = 600;

  if (left.length > maxExactLines || right.length > maxExactLines) {
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => ({
      left: left[index],
      right: right[index],
      leftNumber: left[index] === undefined ? undefined : index + 1,
      rightNumber: right[index] === undefined ? undefined : index + 1,
      state: left[index] === right[index] ? "same" : left[index] === undefined ? "added" : right[index] === undefined ? "removed" : "changed",
    }));
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      rows.push({ left: left[leftIndex], right: right[rightIndex], leftNumber: leftIndex + 1, rightNumber: rightIndex + 1, state: "same" });
      leftIndex += 1;
      rightIndex += 1;
    } else if (rightIndex === right.length || (leftIndex < left.length && matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1])) {
      rows.push({ left: left[leftIndex], leftNumber: leftIndex + 1, state: "removed" });
      leftIndex += 1;
    } else {
      rows.push({ right: right[rightIndex], rightNumber: rightIndex + 1, state: "added" });
      rightIndex += 1;
    }
  }

  const merged: DiffRow[] = [];
  for (let index = 0; index < rows.length;) {
    if (rows[index].state === "same") {
      merged.push(rows[index]);
      index += 1;
      continue;
    }
    const block: DiffRow[] = [];
    while (index < rows.length && rows[index].state !== "same") {
      block.push(rows[index]);
      index += 1;
    }
    const removed = block.filter((row) => row.state === "removed");
    const added = block.filter((row) => row.state === "added");
    const paired = Math.min(removed.length, added.length);
    for (let pair = 0; pair < paired; pair += 1) {
      merged.push({ ...removed[pair], right: added[pair].right, rightNumber: added[pair].rightNumber, state: "changed" });
    }
    merged.push(...removed.slice(paired), ...added.slice(paired));
  }
  return merged;
}

function splitItems(value: string, deduplicate: boolean) {
  const items = value
    .split(/[，,;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!deduplicate) return items;

  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function CopyButton(props: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!props.value) return;
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access is unavailable only in constrained browser previews.
    }
  }

  return (
    <button className="tool-copy-button" type="button" onClick={() => void copy()} disabled={!props.value}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
      {copied ? "已复制" : props.label ?? "复制"}
    </button>
  );
}

function JsonTool() {
  const [input, setInput] = useState(sampleJson);
  const [mode, setMode] = useState<JsonMode>("pretty");
  const result = useMemo(() => formatJson(input, mode), [input, mode]);

  return (
    <ToolWorkspace
      title="JSON 格式化"
      description="粘贴接口返回或配置，立即校验并转换。"
      result={result.output}
      resultLabel={mode === "pretty" ? "格式化结果" : "压缩结果"}
      error={result.error}
      input={input}
      onInputChange={setInput}
      toolbar={
        <div className="tool-workspace-actions">
          <div className="segmented-control" aria-label="JSON 输出格式">
            <button className={mode === "pretty" ? "selected" : ""} type="button" onClick={() => setMode("pretty")}>格式化</button>
            <button className={mode === "compact" ? "selected" : ""} type="button" onClick={() => setMode("compact")}>压缩</button>
          </div>
          <CopyButton value={result.output} />
        </div>
      }
    />
  );
}

function TimestampTool() {
  const [input, setInput] = useState(() => String(Date.now()));
  const [timeZone, setTimeZone] = useState("Asia/Shanghai");
  const result = useMemo(() => timestampResult(input, timeZone), [input, timeZone]);
  const zoneLabel = timeZones.find((zone) => zone.id === timeZone)?.label ?? timeZone;

  return (
    <section className="tool-workspace">
      <div className="tool-workspace-head">
        <div><h2>时间戳转换</h2><p>自动识别秒、毫秒与常见日期格式。</p></div>
        <div className="timestamp-actions"><label className="timestamp-zone"><span>时区</span><select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></label><button className="tool-action-button" type="button" onClick={() => setInput(String(Date.now()))}><Clock3 size={16} aria-hidden="true" />当前时间</button></div>
      </div>
      <label className="tool-field"><span>Unix 时间戳或日期</span><input className="text-field" value={input} onChange={(event) => setInput(event.target.value)} placeholder="1721612419000 或 2026-07-22 09:30:00" /></label>
      {result.error ? <p className="tool-error">{result.error}</p> : <div className="timestamp-grid">
        <ResultTile label="毫秒时间戳" value={result.timestamp} />
        <ResultTile label="ISO 8601 (UTC)" value={result.iso} />
        <ResultTile label={`${zoneLabel}时间`} value={result.local} />
      </div>}
    </section>
  );
}

function ResultTile(props: { label: string; value: string }) {
  return <section className="result-tile"><span>{props.label}</span><code>{props.value || "--"}</code><CopyButton value={props.value} /></section>;
}

function formatDuration(milliseconds: number) {
  const totalCentiseconds = Math.floor(Math.max(0, milliseconds) / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function toDateTimeLocal(timestamp: number) {
  const localDate = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function TimerTool() {
  const [now, setNow] = useState(Date.now());
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(null);
  const [stopwatchSaved, setStopwatchSaved] = useState(0);
  const [countdownRemaining, setCountdownRemaining] = useState(5 * 60 * 1000);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [countdownMode, setCountdownMode] = useState<"duration" | "target">("duration");
  const [targetDate, setTargetDate] = useState(() => toDateTimeLocal(Date.now() + 5 * 60 * 1000));
  const [reminderMinutes, setReminderMinutes] = useState(1);
  const [reminderTriggered, setReminderTriggered] = useState(false);
  const [countdownNotice, setCountdownNotice] = useState("");
  const stopwatchRunning = stopwatchStartedAt !== null;
  const countdownRunning = countdownEndsAt !== null;
  const stopwatchValue = stopwatchSaved + (stopwatchStartedAt ? now - stopwatchStartedAt : 0);
  const targetTimestamp = new Date(targetDate).getTime();
  const configuredTargetRemaining = Number.isFinite(targetTimestamp) ? Math.max(0, targetTimestamp - now) : 0;
  const countdownValue = countdownEndsAt ? Math.max(0, countdownEndsAt - now) : countdownMode === "target" ? configuredTargetRemaining : countdownRemaining;

  useEffect(() => {
    if (!stopwatchRunning && !countdownRunning) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(interval);
  }, [countdownRunning, stopwatchRunning]);

  useEffect(() => {
    if (!countdownEndsAt) return;
    if (countdownValue === 0) {
      setCountdownEndsAt(null);
      setCountdownRemaining(0);
      setCountdownNotice("倒计时已结束");
      if ("Notification" in window && Notification.permission === "granted") new Notification("ForgeDesk 倒计时", { body: "倒计时已结束" });
      return;
    }
    if (!reminderTriggered && reminderMinutes > 0 && countdownValue <= reminderMinutes * 60_000) {
      const message = `提醒：距离结束还有 ${formatDuration(countdownValue)}`;
      setReminderTriggered(true);
      setCountdownNotice(message);
      if ("Notification" in window && Notification.permission === "granted") new Notification("ForgeDesk 倒计时", { body: message });
    }
  }, [countdownEndsAt, countdownValue, reminderMinutes, reminderTriggered]);

  function updateCountdown(part: "minutes" | "seconds", value: string) {
    const numeric = Math.max(0, Number(value) || 0);
    const next = part === "minutes"
      ? numeric * 60_000 + (Math.floor(countdownRemaining / 1000) % 60) * 1000
      : Math.floor(countdownRemaining / 60_000) * 60_000 + Math.min(59, numeric) * 1000;
    setCountdownEndsAt(null);
    setCountdownRemaining(next);
    setCountdownNotice("");
    setReminderTriggered(false);
  }

  function toggleStopwatch() {
    if (stopwatchRunning) {
      setStopwatchSaved(stopwatchValue);
      setStopwatchStartedAt(null);
      return;
    }
    setStopwatchStartedAt(Date.now());
  }

  function toggleCountdown() {
    if (countdownRunning) {
      if (countdownMode === "duration") setCountdownRemaining(countdownValue);
      setCountdownEndsAt(null);
      return;
    }
    if (countdownMode === "target" && (!Number.isFinite(targetTimestamp) || targetTimestamp <= Date.now())) {
      setCountdownNotice("目标时间需要晚于当前时间");
      return;
    }
    if (countdownValue > 0) {
      setCountdownEndsAt(countdownMode === "target" ? targetTimestamp : Date.now() + countdownValue);
      setCountdownNotice("");
      setReminderTriggered(false);
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    }
  }

  return (
    <section className="timer-workspace">
      <div><h2>定时器</h2><p>计时器与倒计时都基于真实时间推进，暂停后可继续。</p></div>
      <div className="timer-grid">
        <section className="timer-panel"><div className="timer-panel-head"><span>计时器</span><strong>{stopwatchRunning ? "进行中" : "已暂停"}</strong></div><output>{formatDuration(stopwatchValue)}</output><div className="timer-actions"><button className="timer-primary" type="button" onClick={toggleStopwatch}>{stopwatchRunning ? <><Pause size={16} aria-hidden="true" />暂停</> : <><Play size={16} aria-hidden="true" />开始</>}</button><button className="tool-action-button" type="button" onClick={() => { setStopwatchStartedAt(null); setStopwatchSaved(0); }}><RotateCcw size={15} aria-hidden="true" />重置</button></div></section>
        <section className="timer-panel"><div className="timer-panel-head"><span>倒计时</span><strong>{countdownRunning ? "进行中" : countdownValue === 0 ? "已结束" : "已暂停"}</strong></div><output>{formatDuration(countdownValue)}</output><div className="segmented-control timer-mode"><button className={countdownMode === "duration" ? "selected" : ""} type="button" onClick={() => { setCountdownEndsAt(null); setCountdownMode("duration"); }}>按时长</button><button className={countdownMode === "target" ? "selected" : ""} type="button" onClick={() => { setCountdownEndsAt(null); setCountdownMode("target"); }}>目标时间</button></div>{countdownMode === "duration" ? <div className="countdown-inputs"><label><span>分钟</span><input type="number" min="0" value={Math.floor(countdownRemaining / 60_000)} onChange={(event) => updateCountdown("minutes", event.target.value)} disabled={countdownRunning} /></label><label><span>秒</span><input type="number" min="0" max="59" value={Math.floor(countdownRemaining / 1000) % 60} onChange={(event) => updateCountdown("seconds", event.target.value)} disabled={countdownRunning} /></label></div> : <label className="countdown-target"><span>结束时间</span><input type="datetime-local" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); setCountdownNotice(""); setReminderTriggered(false); }} disabled={countdownRunning} /></label>}<label className="countdown-reminder"><span>提前提醒</span><input type="number" min="0" value={reminderMinutes} onChange={(event) => { setReminderMinutes(Math.max(0, Number(event.target.value) || 0)); setReminderTriggered(false); }} /><em>分钟</em></label>{countdownNotice ? <p className="countdown-notice" role="status">{countdownNotice}</p> : null}<div className="timer-actions"><button className="timer-primary" type="button" onClick={toggleCountdown} disabled={!countdownRunning && countdownValue === 0}>{countdownRunning ? <><Pause size={16} aria-hidden="true" />{countdownMode === "target" ? "停止" : "暂停"}</> : <><Play size={16} aria-hidden="true" />开始</>}</button><button className="tool-action-button" type="button" onClick={() => { setCountdownEndsAt(null); setCountdownRemaining(5 * 60 * 1000); setTargetDate(toDateTimeLocal(Date.now() + 5 * 60 * 1000)); setCountdownNotice(""); setReminderTriggered(false); }}><RotateCcw size={15} aria-hidden="true" />重置</button></div></section>
      </div>
    </section>
  );
}

function JwtTool() {
  const [input, setInput] = useState("");
  const result = useMemo(() => parseJwt(input), [input]);
  const claims = useMemo(() => {
    if (!result.payload) return [] as Array<{ name: string; value: string }>;
    const payload = JSON.parse(result.payload) as Record<string, unknown>;
    return ["iat", "nbf", "exp"].flatMap((name) => typeof payload[name] === "number" ? [{ name, value: formatDate(payload[name] as number * 1000) }] : []);
  }, [result.payload]);

  return (
    <section className="tool-workspace">
      <div className="tool-workspace-head"><div><h2>JWT 解析</h2><p>只解码 Header 与 Payload，不会验证签名或上传 Token。</p></div></div>
      <label className="tool-field"><span>JWT</span><textarea className="log-editor tool-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="粘贴 eyJ...，也支持 Bearer 前缀" spellCheck={false} /></label>
      {result.error ? <p className="tool-error">{input ? result.error : "粘贴 Token 后将显示已解码内容"}</p> : <>
        <div className="tool-editor-grid"><OutputPanel title="Header" value={result.header} /><OutputPanel title="Payload" value={result.payload} /></div>
        {claims.length > 0 ? <div className="claim-list">{claims.map((claim) => <div key={claim.name}><strong>{claim.name}</strong><span>{claim.value}</span></div>)}</div> : null}
      </>}
    </section>
  );
}

function DiffTool() {
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");
  const [mode, setMode] = useState<"text" | "json">("text");
  const left = useMemo(() => normalizeCompareValue(leftInput, mode), [leftInput, mode]);
  const right = useMemo(() => normalizeCompareValue(rightInput, mode), [rightInput, mode]);
  const rows = useMemo(() => left.error || right.error ? [] : compareLines(left.value, right.value), [left.error, left.value, right.error, right.value]);
  const summary = useMemo(() => rows.reduce((result, row) => ({ ...result, [row.state]: result[row.state] + 1 }), { same: 0, added: 0, removed: 0, changed: 0 }), [rows]);

  function sortBoth() {
    const sortLines = (value: string) => toLines(value)
      .filter((line) => line.trim())
      .sort((first, second) => first.localeCompare(second, "zh-CN", { numeric: true }))
      .join("\n");
    setLeftInput(sortLines(leftInput));
    setRightInput(sortLines(rightInput));
  }

  function formatBoth() {
    if (!left.error) setLeftInput(left.value);
    if (!right.error) setRightInput(right.value);
  }

  return (
    <section className="compare-workspace">
      <div className="compare-toolbar">
        <div><h2>文本对比</h2><p>逐行比较两份文本；JSON 模式会先规范化结构。</p></div>
        <div className="compare-actions">
          <label className="compare-mode"><span>模式</span><select value={mode} onChange={(event) => setMode(event.target.value as "text" | "json")}><option value="text">文本</option><option value="json">JSON</option></select></label>
          <button className="tool-action-button" type="button" onClick={formatBoth} disabled={mode !== "json" || Boolean(left.error || right.error)}><Braces size={15} aria-hidden="true" />格式化</button>
          <button className="tool-action-button" type="button" onClick={sortBoth} disabled={mode !== "text"}><ListOrdered size={15} aria-hidden="true" />排序两侧</button>
          <button className="tool-action-button" type="button" onClick={() => { setLeftInput(rightInput); setRightInput(leftInput); }}><ArrowLeftRight size={15} aria-hidden="true" />互换</button>
          <button className="tool-action-button" type="button" onClick={() => { setLeftInput(""); setRightInput(""); }}><Eraser size={15} aria-hidden="true" />清空</button>
        </div>
      </div>
      {left.error || right.error ? <div className="compare-errors"><p>{left.error ? `左侧：${left.error}` : ""}</p><p>{right.error ? `右侧：${right.error}` : ""}</p></div> : null}
      <div className="compare-input-grid">
        <label className="compare-editor"><span>左侧文本</span><textarea value={leftInput} onChange={(event) => setLeftInput(event.target.value)} placeholder={mode === "json" ? "粘贴 JSON" : "粘贴第一份文本"} spellCheck={false} /></label>
        <label className="compare-editor"><span>右侧文本</span><textarea value={rightInput} onChange={(event) => setRightInput(event.target.value)} placeholder={mode === "json" ? "粘贴 JSON" : "粘贴第二份文本"} spellCheck={false} /></label>
      </div>
      <div className="compare-result-head"><div><strong>对比结果</strong><span>相同 {summary.same} · 变更 {summary.changed} · 仅左 {summary.removed} · 仅右 {summary.added}</span></div><CopyButton value={rows.map((row) => `${row.left ?? ""}\t${row.right ?? ""}`).join("\n")} label="复制结果" /></div>
      {!leftInput && !rightInput ? <p className="tool-empty">在上方粘贴两份文本开始比较。</p> : <div className="compare-result-grid">
        <CompareColumn label="左侧" rows={rows} side="left" />
        <CompareColumn label="右侧" rows={rows} side="right" />
      </div>}
    </section>
  );
}

function CompareColumn(props: { label: string; rows: DiffRow[]; side: "left" | "right" }) {
  return <section className="compare-result-column"><header>{props.label}</header><div>{props.rows.map((row, index) => {
    const text = props.side === "left" ? row.left : row.right;
    const number = props.side === "left" ? row.leftNumber : row.rightNumber;
    return <pre className={`compare-line ${row.state} ${text === undefined ? "empty" : ""}`} key={`${props.side}-${index}`}><span>{number ?? ""}</span><code>{text ?? ""}</code></pre>;
  })}</div></section>;
}

function TextTool() {
  const [input, setInput] = useState("1024, 1025，1026\n1024; 1027");
  const [mode, setMode] = useState<TextOutputMode>("lines");
  const [deduplicate, setDeduplicate] = useState(true);
  const items = useMemo(() => splitItems(input, deduplicate), [deduplicate, input]);
  const output = useMemo(() => {
    if (mode === "lines") return items.join("\n");
    if (mode === "csv") return items.join(",");
    return `(${items.map((item) => `'${item.replaceAll("'", "''")}'`).join(", ")})`;
  }, [items, mode]);

  return (
    <section className="tool-workspace">
      <div className="tool-workspace-head"><div><h2>文本与 ID</h2><p>按逗号、空格、分号或换行拆分，去掉首尾空格。</p></div><div className="tool-workspace-actions text-tool-actions"><div className="text-tool-settings"><span className="tool-count">处理后 {items.length} 项</span><label className="dedupe-switch"><input type="checkbox" checked={deduplicate} onChange={(event) => setDeduplicate(event.target.checked)} /><span>去重</span></label></div><div className="segmented-control"><button className={mode === "lines" ? "selected" : ""} type="button" onClick={() => setMode("lines")}>每行一个</button><button className={mode === "csv" ? "selected" : ""} type="button" onClick={() => setMode("csv")}>逗号组合</button><button className={mode === "sql" ? "selected" : ""} type="button" onClick={() => setMode("sql")}>SQL IN</button></div><CopyButton value={output} /></div></div>
      <div className="tool-editor-grid">
        <label className="tool-field"><span>输入</span><textarea className="log-editor tool-input" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></label>
        <div className="tool-field"><span>输出</span><pre className="tool-output">{output || "--"}</pre></div>
      </div>
    </section>
  );
}

function TranslationTool(props: {
  providerId: TranslationProvider;
  setProviderId: (provider: TranslationProvider) => void;
  credentials: Record<TranslationProvider, TranslationCredentials>;
  onUpdateCredential: (key: keyof TranslationCredentials, value: string) => void;
  runtimeMode: "local" | "connected";
}) {
  const [sourceLanguage, setSourceLanguage] = useState("zh");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [showConfiguration, setShowConfiguration] = useState(false);
  const provider = translationProviders.find((item) => item.id === props.providerId) ?? translationProviders[0];

  async function translate() {
    if (props.runtimeMode !== "connected") {
      setError("翻译需要切换到“服务”运行模式后才能调用第三方厂商");
      setStatus("error");
      return;
    }
    if (!sourceText.trim()) {
      setError("请输入需要翻译的文本");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const response = await translateText({
        provider: props.providerId,
        text: sourceText,
        sourceLanguage,
        targetLanguage,
        credentials: props.credentials[props.providerId],
      });
      setTranslatedText(response.translatedText);
      setStatus("idle");
    } catch (translationError) {
      setError(translationError instanceof Error ? translationError.message : "翻译失败，请检查配置后重试");
      setStatus("error");
    }
  }

  return (
    <section className="translation-workspace">
      <div className="translation-toolbar">
        <div><h2>文本翻译</h2><p>{props.runtimeMode === "connected" ? "通过已连接服务调用所选翻译厂商。" : "当前处于本地运行；切换到服务模式后才会发送翻译请求。"}</p></div>
        <div className="translation-controls">
          <label><span>厂商</span><select value={props.providerId} onChange={(event) => props.setProviderId(event.target.value as TranslationProvider)}>{translationProviders.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>源语言</span><select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}><option value="zh">中文</option><option value="en">英语</option><option value="ja">日语</option><option value="ko">韩语</option></select></label>
          <button className="translation-swap" type="button" aria-label="交换源语言和目标语言" onClick={() => { setSourceLanguage(targetLanguage); setTargetLanguage(sourceLanguage); }}><ArrowLeftRight size={16} aria-hidden="true" /></button>
          <label><span>目标语言</span><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}><option value="en">英语</option><option value="zh">中文</option><option value="ja">日语</option><option value="ko">韩语</option></select></label>
          <button className="tool-action-button" type="button" onClick={() => setShowConfiguration((visible) => !visible)}><Settings2 size={15} aria-hidden="true" />配置</button>
        </div>
      </div>
      <div className="translation-editor-grid">
        <label className="translation-editor"><span>原文</span><textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="输入或粘贴需要翻译的文本" spellCheck={false} /></label>
        <section className="translation-editor"><div className="translation-result-head"><span>译文</span><CopyButton value={translatedText} /></div><pre>{translatedText || "翻译结果会显示在这里"}</pre></section>
      </div>
      {error ? <p className="translation-error" role="alert">{error}</p> : null}
      {showConfiguration ? <section className="translation-inline-settings"><div><strong>{provider.label} 凭证</strong><p>仅保留在当前应用会话中，不写入浏览器存储。</p></div><div className="translation-settings-fields">{provider.credentialFields.map((field) => <label key={field.key}><span>{field.label}</span><input type="password" value={props.credentials[props.providerId][field.key]} onChange={(event) => props.onUpdateCredential(field.key, event.target.value)} placeholder={field.placeholder} autoComplete="off" /></label>)}</div></section> : null}
      <div className="translation-submit-row"><span>当前使用：{provider.label}。通过“配置”维护当前会话凭证。</span><button className="translation-submit" type="button" onClick={() => void translate()} disabled={status === "loading" || props.runtimeMode !== "connected"}>{status === "loading" ? "翻译中..." : <><Send size={15} aria-hidden="true" />翻译</>}</button></div>
    </section>
  );
}

function OutputPanel(props: { title: string; value: string }) {
  return <section className="output-panel"><div className="tool-result-head"><strong>{props.title}</strong><CopyButton value={props.value} /></div><pre className="tool-output">{props.value}</pre></section>;
}

function ToolWorkspace(props: { title: string; description: string; input: string; onInputChange: (value: string) => void; result: string; resultLabel: string; error: string; toolbar: ReactNode }) {
  return <section className="tool-workspace"><div className="tool-workspace-head"><div><h2>{props.title}</h2><p>{props.description}</p></div>{props.toolbar}</div><div className="tool-editor-grid"><label className="tool-field"><span>输入</span><textarea className="log-editor tool-input" value={props.input} onChange={(event) => props.onInputChange(event.target.value)} spellCheck={false} /></label><div className="tool-field"><span>{props.resultLabel}</span>{props.error ? <p className="tool-error">{props.error}</p> : <pre className="tool-output">{props.result}</pre>}</div></div></section>;
}

function ToolDirectory(props: { onOpen: (tool: ToolId) => void }) {
  return <section className="tool-directory"><div className="tool-directory-head"><h2>开发工具</h2><p>选择一个工具进入独立工作区。纯本地工具不会请求服务。</p></div><div className="tool-card-grid">{tools.map((tool) => { const Icon = tool.icon; return <button className="tool-launcher-card" key={tool.id} type="button" onClick={() => props.onOpen(tool.id)}><div className="tool-launcher-card-head"><span className="tool-launcher-icon"><Icon size={19} aria-hidden="true" /></span><span className={`tool-service-badge ${tool.requiresService ? "service" : "local"}`}>{tool.requiresService ? "需要服务" : "纯本地"}</span></div><strong>{tool.label}</strong><p>{tool.description}</p></button>; })}</div></section>;
}

function DeveloperToolboxPlugin(props: { context: PluginContext }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [translationProviderId, setTranslationProviderId] = useState<TranslationProvider>("baidu");
  const [translationCredentials, setTranslationCredentials] = useState<Record<TranslationProvider, TranslationCredentials>>({ baidu: { ...emptyCredentials }, youdao: { ...emptyCredentials }, google: { ...emptyCredentials }, alibaba: { ...emptyCredentials } });

  function updateTranslationCredential(key: keyof TranslationCredentials, value: string) {
    setTranslationCredentials((current) => ({ ...current, [translationProviderId]: { ...current[translationProviderId], [key]: value } }));
  }

  if (!activeTool) return <ToolDirectory onOpen={setActiveTool} />;

  return (
    <section className="toolbox-shell">
      <div className="tool-surface-nav"><button type="button" onClick={() => setActiveTool(null)}><ArrowLeft size={16} aria-hidden="true" />全部工具</button><span className={props.context.runtimeMode === "connected" ? "connected" : ""}>{props.context.runtimeMode === "connected" ? "已连接服务" : "本地运行"}</span></div>
      {activeTool === "json" ? <JsonTool /> : null}
      {activeTool === "timestamp" ? <TimestampTool /> : null}
      {activeTool === "timer" ? <TimerTool /> : null}
      {activeTool === "jwt" ? <JwtTool /> : null}
      {activeTool === "diff" ? <DiffTool /> : null}
      {activeTool === "text" ? <TextTool /> : null}
      {activeTool === "translate" ? <TranslationTool providerId={translationProviderId} setProviderId={setTranslationProviderId} credentials={translationCredentials} onUpdateCredential={updateTranslationCredential} runtimeMode={props.context.runtimeMode} /> : null}
    </section>
  );
}

export const developerToolboxPlugin: PluginDefinition = {
  id: "developer-toolbox",
  name: "开发工具箱",
  description: "本地处理高频研发数据；翻译按需调用已连接服务。",
  icon: TableProperties,
  category: "处理",
  shortcuts: ["json", "jwt", "diff"],
  accent: "amber",
  serviceRequirement: "on-demand",
  component: DeveloperToolboxPlugin,
};
