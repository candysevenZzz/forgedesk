import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Cloud,
  GripVertical,
  HardDrive,
  ListTodo,
  Pin,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { syncWorkNotes } from "../api";
import {
  loadWorkNotes,
  saveWorkNotes,
  todayWorkNotesDate,
  type WorkNote,
  type WorkNoteKind,
  type WorkNotesArchive,
} from "../work-notes-storage";
import type { PluginContext, PluginDefinition } from "../types";

type DragState = { id: string; offsetX: number; offsetY: number } | null;

function archiveHasContent(archive: WorkNotesArchive) {
  return Object.values(archive.days).some((notes) => notes.length > 0) || Object.keys(archive.tombstones).length > 0;
}

function clearLegacySeedText(note: WorkNote): WorkNote {
  if (note.id === "memo-welcome" && note.title === "备忘录" && note.content === "记录需要跟进的想法和信息。") {
    return { ...note, title: "", content: "" };
  }
  if (note.id === "todo-welcome" && note.title === "开始今天的工作" && !note.content) {
    return { ...note, title: "" };
  }
  if (
    note.id === "card-welcome" &&
    note.title === "可拖动卡片" &&
    note.content === "拖动标题栏改变位置；置顶可让它显示在其它卡片上方。"
  ) {
    return { ...note, title: "", content: "" };
  }
  return note;
}

function isEmptyLegacySeed(note: WorkNote) {
  return (
    ["memo-welcome", "todo-welcome", "card-welcome"].includes(note.id) && !note.title.trim() && !note.content.trim()
  );
}

function createNote(kind: WorkNoteKind, position: number): WorkNote {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return {
    id,
    kind,
    title: "",
    content: "",
    completed: false,
    pinned: false,
    x: 32 + (position % 4) * 28,
    y: 32 + (position % 3) * 28,
    zIndex: position + 2,
    updatedAt: new Date().toISOString(),
  };
}

function formatHistoryDate(date: string, today: string) {
  const parts = historyDateParts(date, today);
  return `${parts.primary} ${parts.secondary}`;
}

function historyDateParts(date: string, today: string) {
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(`${date}T00:00:00+08:00`));
  const value = (type: Intl.DateTimeFormatPartTypes) => formatted.find((part) => part.type === type)?.value ?? "";
  return {
    primary: date === today ? "今天" : `${value("month")}月${value("day")}日`,
    secondary: date === today ? `周${value("weekday").replace("周", "").replace("星期", "")}` : value("weekday"),
  };
}

function WorkNotesPlugin(props: { context: PluginContext }) {
  const today = todayWorkNotesDate();
  const [archive, setArchive] = useState<WorkNotesArchive>({ version: 2, days: {}, tombstones: {} });
  const [selectedDate, setSelectedDate] = useState(today);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState<DragState>(null);
  const [syncStatus, setSyncStatus] = useState("本地保存");
  const [syncTick, setSyncTick] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const shouldPersistRef = useRef(false);
  const lastSyncedArchiveRef = useRef("");
  const lastSyncAttemptArchiveRef = useRef("");

  useEffect(() => {
    void loadWorkNotes().then((savedArchive) => {
      const legacySeedIds: string[] = [];
      const days = Object.fromEntries(
        Object.entries(savedArchive.days)
          .map(([date, notes]) => [
            date,
            notes.map(clearLegacySeedText).filter((note) => {
              if (isEmptyLegacySeed(note)) {
                legacySeedIds.push(note.id);
                return false;
              }
              return true;
            }),
          ])
          .filter(([, notes]) => notes.length),
      );
      const removedAt = new Date().toISOString();
      shouldPersistRef.current = legacySeedIds.length > 0;
      setArchive({
        version: 2,
        days,
        tombstones: {
          ...savedArchive.tombstones,
          ...Object.fromEntries(legacySeedIds.map((id) => [id, removedAt])),
        },
      });
      setSelectedDate(today);
      setLoaded(true);
    });
  }, [today]);

  useEffect(() => {
    if (!loaded || (!shouldPersistRef.current && !archiveHasContent(archive))) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void saveWorkNotes(archive);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [archive, loaded]);

  async function syncNow() {
    if (!loaded || props.context.runtimeMode !== "connected" || !props.context.auth || syncingRef.current) {
      return;
    }
    const snapshot = JSON.stringify(archive);
    lastSyncAttemptArchiveRef.current = snapshot;
    syncingRef.current = true;
    setSyncStatus("正在合并服务端记录...");
    try {
      const result = await syncWorkNotes(archive);
      const merged = { ...result.archive, version: 2 as const, tombstones: result.archive.tombstones ?? {} };
      lastSyncedArchiveRef.current = JSON.stringify(merged);
      setArchive((current) => (JSON.stringify(current) === snapshot ? merged : current));
      setSyncStatus(
        `已同步 ${new Date(result.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch {
      setSyncStatus("同步失败，本地内容未受影响");
    } finally {
      syncingRef.current = false;
      setSyncTick((current) => current + 1);
    }
  }

  useEffect(() => {
    if (!loaded || props.context.runtimeMode !== "connected" || !props.context.auth) {
      if (loaded) {
        setSyncStatus(props.context.runtimeMode === "connected" ? "登录后可同步" : "本地保存");
      }
      return undefined;
    }
    const serialized = JSON.stringify(archive);
    if (serialized === lastSyncedArchiveRef.current || serialized === lastSyncAttemptArchiveRef.current) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      void syncNow();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [archive, loaded, props.context.runtimeMode, syncTick]);

  const notes = archive.days[selectedDate] ?? [];
  const historyDates = [today, ...Object.keys(archive.days).filter((date) => date !== today)].sort((first, second) =>
    second.localeCompare(first),
  );

  function updateCurrentDay(updater: (current: WorkNote[]) => WorkNote[]) {
    shouldPersistRef.current = true;
    setArchive((current) => {
      const nextNotes = updater(current.days[selectedDate] ?? []);
      const nextDays = { ...current.days };
      if (nextNotes.length) {
        nextDays[selectedDate] = nextNotes;
      } else {
        delete nextDays[selectedDate];
      }
      return { ...current, days: nextDays };
    });
  }

  function updateNote(id: string, changes: Partial<WorkNote>) {
    updateCurrentDay((current) =>
      current.map((note) => (note.id === id ? { ...note, ...changes, updatedAt: new Date().toISOString() } : note)),
    );
  }

  function addNote(kind: WorkNoteKind) {
    updateCurrentDay((current) => [...current, createNote(kind, current.length)]);
  }

  function deleteNote(id: string) {
    const deletedAt = new Date().toISOString();
    shouldPersistRef.current = true;
    setArchive((current) => {
      const remaining = (current.days[selectedDate] ?? []).filter((note) => note.id !== id);
      const nextDays = { ...current.days };
      if (remaining.length) {
        nextDays[selectedDate] = remaining;
      } else {
        delete nextDays[selectedDate];
      }
      return { ...current, days: nextDays, tombstones: { ...current.tombstones, [id]: deletedAt } };
    });
  }

  function raiseNote(id: string, pin: boolean) {
    const nextZIndex = Math.max(0, ...notes.map((note) => note.zIndex)) + 1;
    updateNote(id, { pinned: pin, zIndex: nextZIndex });
  }

  function startDragging(event: React.PointerEvent<HTMLDivElement>, note: WorkNote) {
    if (!boardRef.current) {
      return;
    }
    const rect = boardRef.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      id: note.id,
      offsetX: event.clientX - rect.left - note.x,
      offsetY: event.clientY - rect.top - note.y,
    });
    raiseNote(note.id, note.pinned);
  }

  function moveCard(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !boardRef.current) {
      return;
    }
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 248, event.clientX - rect.left - dragging.offsetX));
    const y = Math.max(0, Math.min(rect.height - 150, event.clientY - rect.top - dragging.offsetY));
    updateNote(dragging.id, { x, y });
  }

  const memos = notes.filter((note) => note.kind === "memo");
  const todos = notes.filter((note) => note.kind === "todo");
  const cards = notes.filter((note) => note.kind === "card");
  const selectedDateLabel = formatHistoryDate(selectedDate, today);

  return (
    <section className="work-notes-shell">
      <div className="work-notes-toolbar">
        <div>
          <h2>工作笔记</h2>
          <p>
            {loaded
              ? props.context.runtimeMode === "connected"
                ? props.context.auth
                  ? `${selectedDateLabel}的内容先保存到本机，变更后会与服务端合并。`
                  : "登录后可将笔记安全同步到自己的服务端归档。"
                : `${selectedDateLabel}的内容仅保存在本机应用数据目录。`
              : "正在加载本地笔记..."}
          </p>
        </div>
        <div className="work-notes-actions">
          <span className={`notes-sync-state ${props.context.runtimeMode}`}>
            <>
              {props.context.runtimeMode === "connected" ? (
                <Cloud size={15} aria-hidden="true" />
              ) : (
                <HardDrive size={15} aria-hidden="true" />
              )}
            </>
            {syncStatus}
          </span>
          {props.context.runtimeMode === "connected" ? (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={!props.context.serviceOnline || !props.context.auth}
            >
              <RefreshCw size={15} aria-hidden="true" />
              立即同步
            </button>
          ) : null}
          <button type="button" onClick={() => addNote("memo")}>
            <StickyNote size={16} aria-hidden="true" />
            备忘录
          </button>
          <button type="button" onClick={() => addNote("todo")}>
            <ListTodo size={16} aria-hidden="true" />
            待办
          </button>
          <button className="note-card-action" type="button" onClick={() => addNote("card")}>
            <Plus size={16} aria-hidden="true" />
            笔记卡片
          </button>
        </div>
      </div>
      <section className="notes-date-filter">
        <div className="notes-date-filter-head">
          <span>
            <CalendarDays size={15} aria-hidden="true" />
            按日期查看
          </span>
          <small>{historyDates.length} 天记录</small>
        </div>
        <div className="notes-date-rail">
          {historyDates.map((date) => {
            const dateNotes = archive.days[date] ?? [];
            const dateParts = historyDateParts(date, today);
            return (
              <button
                className={`notes-date-chip ${date === selectedDate ? "active" : ""}`}
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-pressed={date === selectedDate}
                title={date}
              >
                <span>
                  <strong>{dateParts.primary}</strong>
                  <small>{dateParts.secondary}</small>
                </span>
                <em>{dateNotes.length}</em>
              </button>
            );
          })}
        </div>
      </section>
      <div className="work-notes-layout">
        <aside className="notes-side-list">
          <section>
            <div className="notes-list-head">
              <strong>备忘录</strong>
              <span>{memos.length}</span>
            </div>
            <div className="notes-list-items">
              {memos.map((note) => (
                <MemoItem key={note.id} note={note} onUpdate={updateNote} onDelete={deleteNote} />
              ))}
            </div>
          </section>
          <section>
            <div className="notes-list-head">
              <strong>工作待办</strong>
              <span>
                {todos.filter((note) => !note.completed).length}/{todos.length}
              </span>
            </div>
            <div className="notes-list-items">
              {todos.map((note) => (
                <TodoItem key={note.id} note={note} onUpdate={updateNote} onDelete={deleteNote} />
              ))}
            </div>
          </section>
        </aside>
        <div className="note-board-wrap">
          <div className="note-board-head">
            <strong>笔记卡片</strong>
            <span>{selectedDateLabel} · 拖动卡片标题栏调整位置</span>
          </div>
          <div
            className="note-board"
            ref={boardRef}
            onPointerMove={moveCard}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
          >
            {cards.map((note) => (
              <FloatingCard
                key={note.id}
                note={note}
                onUpdate={updateNote}
                onDelete={deleteNote}
                onRaise={raiseNote}
                onDragStart={startDragging}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MemoItem(props: {
  note: WorkNote;
  onUpdate: (id: string, changes: Partial<WorkNote>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="memo-item">
      <input
        value={props.note.title}
        aria-label="备忘录标题"
        placeholder="备忘录标题"
        onChange={(event) => props.onUpdate(props.note.id, { title: event.target.value })}
      />
      <textarea
        value={props.note.content}
        aria-label="备忘录内容"
        onChange={(event) => props.onUpdate(props.note.id, { content: event.target.value })}
        placeholder="记录需要跟进的想法和信息"
      />
      <button
        className="note-delete"
        type="button"
        onClick={() => props.onDelete(props.note.id)}
        aria-label="删除备忘录"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </article>
  );
}

function TodoItem(props: {
  note: WorkNote;
  onUpdate: (id: string, changes: Partial<WorkNote>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className={`todo-item ${props.note.completed ? "completed" : ""}`}>
      <label>
        <input
          type="checkbox"
          checked={props.note.completed}
          onChange={(event) => props.onUpdate(props.note.id, { completed: event.target.checked })}
        />
        <input
          value={props.note.title}
          aria-label="待办标题"
          placeholder="写下待办事项"
          onChange={(event) => props.onUpdate(props.note.id, { title: event.target.value })}
        />
      </label>
      <button className="note-delete" type="button" onClick={() => props.onDelete(props.note.id)} aria-label="删除待办">
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </article>
  );
}

function FloatingCard(props: {
  note: WorkNote;
  onUpdate: (id: string, changes: Partial<WorkNote>) => void;
  onDelete: (id: string) => void;
  onRaise: (id: string, pin: boolean) => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>, note: WorkNote) => void;
}) {
  return (
    <article
      className={`floating-note ${props.note.pinned ? "pinned" : ""}`}
      style={{ left: props.note.x, top: props.note.y, zIndex: props.note.zIndex }}
    >
      <div className="floating-note-head" onPointerDown={(event) => props.onDragStart(event, props.note)}>
        <GripVertical size={16} aria-hidden="true" />
        <input
          value={props.note.title}
          aria-label="笔记卡片标题"
          placeholder="笔记卡片标题"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => props.onUpdate(props.note.id, { title: event.target.value })}
        />
        <button
          type="button"
          className={props.note.pinned ? "pinned" : ""}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => props.onRaise(props.note.id, !props.note.pinned)}
          aria-label={props.note.pinned ? "取消置顶" : "置顶卡片"}
        >
          <Pin size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => props.onDelete(props.note.id)}
          aria-label="删除笔记卡片"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <textarea
        value={props.note.content}
        aria-label="笔记卡片内容"
        onChange={(event) => props.onUpdate(props.note.id, { content: event.target.value })}
        placeholder="记录这张卡片的内容"
      />
    </article>
  );
}

export const workNotesPlugin: PluginDefinition = {
  id: "work-notes",
  name: "工作笔记",
  description: "本地备忘录、待办和可拖动的笔记卡片。",
  icon: StickyNote,
  category: "记录",
  shortcuts: ["memo", "todo", "notes"],
  accent: "teal",
  serviceRequirement: "sync",
  component: WorkNotesPlugin,
};
