import { useCallback, useEffect, useMemo, useState } from "react";
import { Club, Crown, DoorOpen, LoaderCircle, Plus, RefreshCw, Send, UsersRound } from "lucide-react";
import {
  bidLandlordRoom,
  chatWebSocketUrl,
  createChatSocketTicket,
  createLandlordRoom,
  fetchLandlordRoom,
  fetchLandlordRooms,
  joinLandlordRoom,
  passLandlordRoom,
  playLandlordCards,
  readyLandlordRoom,
  type LandlordPlayer,
  type LandlordRoom,
  type LandlordRoomSummary,
} from "../api";
import type { PluginContext, PluginDefinition } from "../types";

type RoomEvent = { type: "landlord-room-changed"; roomId: string };

function cardRank(card: string) {
  return card.slice(1);
}

function cardSuit(card: string) {
  const suit = card.charAt(0);
  return suit === "S" ? "♠" : suit === "H" ? "♥" : suit === "C" ? "♣" : suit === "D" ? "♦" : "★";
}

function playerName(player: LandlordPlayer | undefined) {
  return player?.displayName || "等待玩家";
}

function statusCopy(room: LandlordRoom) {
  if (room.status === "WAITING") {
    return "等待三位玩家准备";
  }
  if (room.status === "BIDDING") {
    return `最高叫分 ${room.highestBid || "暂无"}`;
  }
  if (room.status === "FINISHED") {
    return "本局已结束";
  }
  return "轮流出牌，出完手牌获胜";
}

function LandlordUnavailable({ context }: { context: PluginContext }) {
  return (
    <section className="landlord-unavailable">
      <Club size={25} aria-hidden="true" />
      <div>
        <h2>{context.auth ? "斗地主需要服务连接" : "登录后开始联网斗地主"}</h2>
        <p>{context.auth ? "切换到服务运行模式后可创建或加入三人房间。" : "登录后可与其它注册用户进行实时对局。"}</p>
      </div>
    </section>
  );
}

function LandlordGamePlugin({ context }: { context: PluginContext }) {
  const enabled = context.runtimeMode === "connected" && context.serviceOnline && Boolean(context.auth);
  const [rooms, setRooms] = useState<LandlordRoomSummary[]>([]);
  const [room, setRoom] = useState<LandlordRoom | null>(null);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentPlayer = room?.players.find((player) => player.userId === context.auth?.id);
  const currentTurn = room?.status === "BIDDING" ? room.bidTurnSeat : room?.turnSeat;
  const canAct = Boolean(
    room &&
    currentPlayer &&
    room.status !== "WAITING" &&
    room.status !== "FINISHED" &&
    currentTurn === currentPlayer.seat,
  );

  const refreshLobby = useCallback(async () => {
    setRooms(await fetchLandlordRooms());
  }, []);

  const refreshRoom = useCallback(async (roomId: string) => {
    const next = await fetchLandlordRoom(roomId);
    setRoom(next);
    setSelectedCards([]);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRoom(null);
      setRooms([]);
      return;
    }
    void refreshLobby().catch((cause) => setError(cause instanceof Error ? cause.message : "无法加载房间"));
  }, [enabled, refreshLobby]);

  useEffect(() => {
    if (!enabled || !room) {
      return;
    }
    let cancelled = false;
    let socket: WebSocket | null = null;
    void createChatSocketTicket()
      .then(({ ticket }) => {
        if (cancelled) {
          return;
        }
        socket = new WebSocket(chatWebSocketUrl(ticket));
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as RoomEvent;
            if (payload.type === "landlord-room-changed" && payload.roomId === room.id) {
              void refreshRoom(room.id).catch(() => undefined);
            }
          } catch {
            // Ignore unrelated chat events on the shared authenticated realtime channel.
          }
        };
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [enabled, refreshRoom, room?.id]);

  const players = useMemo(
    () => [...(room?.players ?? [])].sort((left, right) => left.seat - right.seat),
    [room?.players],
  );

  async function run(action: () => Promise<LandlordRoom>) {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setRoom(next);
      setSelectedCards([]);
      void refreshLobby().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleCard(card: string) {
    if (!canAct || room?.status !== "PLAYING") {
      return;
    }
    setSelectedCards((current) =>
      current.includes(card) ? current.filter((item) => item !== card) : [...current, card],
    );
  }

  if (!enabled) {
    return <LandlordUnavailable context={context} />;
  }

  if (!room) {
    return (
      <section className="landlord-lobby">
        <header>
          <div>
            <span>三人标准局</span>
            <h2>联网斗地主</h2>
            <p>服务端发牌、裁决与同步。三人全部准备后自动开始。</p>
          </div>
          <button
            type="button"
            className="landlord-primary"
            disabled={busy}
            onClick={() => void run(createLandlordRoom)}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
            创建房间
          </button>
        </header>
        <div className="landlord-lobby-head">
          <strong>等待中的房间</strong>
          <button
            type="button"
            className="landlord-icon-button"
            onClick={() => void refreshLobby()}
            aria-label="刷新房间"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="landlord-room-list">
          {rooms.map((item) => (
            <article key={item.id}>
              <span className="landlord-room-mark">
                <UsersRound size={17} />
              </span>
              <div>
                <strong>{item.playerNames.join("、")}</strong>
                <small>{item.playerNames.length}/3 位玩家</small>
              </div>
              <button type="button" onClick={() => void run(() => joinLandlordRoom(item.id))}>
                加入
              </button>
            </article>
          ))}
          {!rooms.length ? <p className="landlord-empty">暂无可加入房间，创建一局邀请其它在线玩家吧。</p> : null}
        </div>
        {error ? <p className="landlord-error">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="landlord-table-shell">
      <header className="landlord-table-head">
        <button
          type="button"
          onClick={() => {
            setRoom(null);
            setSelectedCards([]);
            void refreshLobby();
          }}
        >
          <DoorOpen size={16} /> 返回大厅
        </button>
        <div>
          <strong>联网斗地主</strong>
          <span>{statusCopy(room)}</span>
        </div>
        <span className="landlord-room-id">房间 {room.id.slice(0, 6)}</span>
      </header>
      <div className="landlord-table">
        <div className="landlord-bottom-cards">
          {room.bottomCards.length ? (
            room.bottomCards.map((card) => (
              <span key={card} className="landlord-mini-card">
                {cardRank(card)}
              </span>
            ))
          ) : (
            <span>底牌将在地主确定后亮出</span>
          )}
        </div>
        <div className="landlord-players">
          {[0, 1, 2].map((seat) => {
            const player = players.find((item) => item.seat === seat);
            const active = currentTurn === seat && room.status !== "WAITING" && room.status !== "FINISHED";
            return (
              <div className={`landlord-player seat-${seat} ${active ? "active" : ""}`} key={seat}>
                <span>{player?.landlord ? <Crown size={14} /> : <UsersRound size={14} />}</span>
                <strong>{playerName(player)}</strong>
                <small>{player ? `${player.handCount} 张${player.ready ? " · 已准备" : ""}` : "等待加入"}</small>
              </div>
            );
          })}
        </div>
        <div className="landlord-last-play">
          <span>
            {room.lastSeat >= 0
              ? `${playerName(players.find((player) => player.seat === room.lastSeat))} 出牌`
              : "等待首家出牌"}
          </span>
          <div>
            {room.lastCards.map((card) => (
              <span className="landlord-play-card" key={card}>
                {cardRank(card)}
              </span>
            ))}
          </div>
        </div>
        <aside className="landlord-moves">
          {room.moves
            .slice(-5)
            .reverse()
            .map((move, index) => (
              <p key={`${move.createdAt}-${index}`}>
                <strong>{move.displayName}</strong>
                {move.action}
                {move.cards.length ? ` ${move.cards.map(cardRank).join(" ")}` : ""}
              </p>
            ))}
        </aside>
      </div>
      {room.status === "WAITING" ? (
        <div className="landlord-actions">
          <span>
            {room.players.length}/3 位玩家 · {currentPlayer?.ready ? "你已准备" : "等待准备"}
          </span>
          <button
            className="landlord-primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => readyLandlordRoom(room.id))}
          >
            {currentPlayer?.ready ? "取消准备" : "准备开始"}
          </button>
        </div>
      ) : null}
      {room.status === "BIDDING" && canAct ? (
        <div className="landlord-actions">
          <span>轮到你叫地主</span>
          {[0, 1, 2, 3].map((bid) => (
            <button
              key={bid}
              type="button"
              disabled={busy || (bid > 0 && bid <= room.highestBid)}
              onClick={() => void run(() => bidLandlordRoom(room.id, bid))}
            >
              {bid === 0 ? "不叫" : `${bid} 分`}
            </button>
          ))}
        </div>
      ) : null}
      {room.status === "PLAYING" ? (
        <>
          <div className="landlord-hand">
            {room.hand.map((card) => (
              <button
                key={card}
                className={`landlord-card ${selectedCards.includes(card) ? "selected" : ""} ${cardSuit(card) === "♥" || cardSuit(card) === "♦" ? "red" : ""}`}
                type="button"
                onClick={() => toggleCard(card)}
              >
                <strong>{cardRank(card)}</strong>
                <span>{cardSuit(card)}</span>
              </button>
            ))}
          </div>
          <div className="landlord-actions">
            <span>{canAct ? "轮到你操作" : "等待其它玩家操作"}</span>
            <button
              type="button"
              disabled={!canAct || busy || !selectedCards.length}
              className="landlord-primary"
              onClick={() => void run(() => playLandlordCards(room.id, selectedCards))}
            >
              <Send size={15} /> 出牌
            </button>
            <button
              type="button"
              disabled={!canAct || busy || room.lastCards.length === 0}
              onClick={() => void run(() => passLandlordRoom(room.id))}
            >
              不要
            </button>
          </div>
        </>
      ) : null}
      {room.status === "FINISHED" ? (
        <div className="landlord-actions landlord-finished">
          <span>{playerName(players.find((player) => player.userId === room.winnerId))} 获胜</span>
          <button
            type="button"
            onClick={() => {
              setRoom(null);
              void refreshLobby();
            }}
          >
            再开一局
          </button>
        </div>
      ) : null}
      {error ? <p className="landlord-error">{error}</p> : null}
    </section>
  );
}

export const landlordGamePlugin: PluginDefinition = {
  id: "landlord-game",
  name: "联网斗地主",
  description: "三人实时对局，服务端统一发牌与裁决。",
  icon: Club,
  category: "休息",
  shortcuts: ["landlord", "dou dizhu", "斗地主"],
  accent: "amber",
  serviceRequirement: "on-demand",
  component: LandlordGamePlugin,
};
