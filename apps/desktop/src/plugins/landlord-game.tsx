import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Club,
  Crown,
  DoorOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  bidLandlordRoom,
  assetUrl,
  chatWebSocketUrl,
  createChatSocketTicket,
  createLandlordRoom,
  fetchLandlordRoom,
  fetchLandlordRooms,
  fillLandlordBots,
  joinLandlordRoom,
  passLandlordRoom,
  playLandlordCards,
  readyLandlordRoom,
  type LandlordMove,
  type LandlordPlayer,
  type LandlordRoom,
  type LandlordRoomSummary,
} from "../api";
import type { PluginContext, PluginDefinition } from "../types";

type RoomEvent = { type: "landlord-room-changed"; roomId: string };

function cardRank(card: string) {
  const rank = card.slice(1);
  if (rank === "SJ") {
    return "小王";
  }
  if (rank === "BJ") {
    return "大王";
  }
  return rank;
}

function cardSuit(card: string) {
  if (isJoker(card)) {
    return "王";
  }
  const suit = card.charAt(0);
  return suit === "S" ? "♠" : suit === "H" ? "♥" : suit === "C" ? "♣" : "♦";
}

function isJoker(card: string) {
  return card === "XSJ" || card === "XBJ";
}

function isRedCard(card: string) {
  return card === "XBJ" || card.startsWith("H") || card.startsWith("D");
}

function playerName(player: LandlordPlayer | undefined) {
  return player?.displayName || "等待玩家";
}

function LandlordAvatar({ player }: { player: LandlordPlayer | undefined }) {
  const avatar = player?.avatarUrl ? assetUrl(player.avatarUrl) : "";
  if (player?.bot) {
    return <Bot size={14} aria-label="人机玩家" />;
  }
  if (avatar) {
    return <img src={avatar} alt="" />;
  }
  return <span>{playerName(player).slice(0, 1)}</span>;
}

function PlayerCardBacks({ count }: { count: number }) {
  const visible = Math.min(count, 8);
  return (
    <div className="landlord-card-backs" aria-label={`剩余 ${count} 张牌`}>
      {Array.from({ length: visible }, (_, index) => (
        <span key={index} style={{ "--card-index": index } as CSSProperties} />
      ))}
      {count > visible ? <em>+{count - visible}</em> : null}
    </div>
  );
}

function playerSeatClass(seat: number, currentPlayer: LandlordPlayer | undefined) {
  if (!currentPlayer) {
    return `seat-${seat}`;
  }
  // The server advances seats clockwise: 0 -> 1 -> 2 -> 0. Keep that next player
  // at the viewer's right, with the previous player on the left.
  return `seat-${(currentPlayer.seat - seat + 3) % 3}`;
}

function playerStatus(player: LandlordPlayer | undefined) {
  if (!player) {
    return "等待加入";
  }
  if (player.bot) {
    return "AI 就绪";
  }
  return player.ready ? "已准备" : "未准备";
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
  const [revealedHandIds, setRevealedHandIds] = useState<string[]>([]);
  const [shownMoves, setShownMoves] = useState<LandlordMove[]>([]);
  const shownMovesRef = useRef<LandlordMove[]>([]);
  const receivedRoomIdRef = useRef("");
  const receivedMoveCountRef = useRef(0);
  const playbackQueueRef = useRef<LandlordMove[]>([]);
  const playbackTimerRef = useRef<number | null>(null);
  const playNextMoveRef = useRef<() => void>(() => undefined);
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

  const clearMovePlayback = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    playbackQueueRef.current = [];
  }, []);

  const playNextMove = useCallback(() => {
    const nextMove = playbackQueueRef.current.shift();
    if (!nextMove) {
      playbackTimerRef.current = null;
      return;
    }
    shownMovesRef.current = [...shownMovesRef.current, nextMove];
    setShownMoves(shownMovesRef.current);
    playbackTimerRef.current = window.setTimeout(() => playNextMoveRef.current(), 720);
  }, []);
  playNextMoveRef.current = playNextMove;

  const applyRoom = useCallback(
    (next: LandlordRoom) => {
      const isNewRoom = receivedRoomIdRef.current !== next.id;
      const movesReset = next.moves.length < receivedMoveCountRef.current;
      if (isNewRoom || movesReset) {
        clearMovePlayback();
        receivedRoomIdRef.current = next.id;
        receivedMoveCountRef.current = next.moves.length;
        shownMovesRef.current = next.moves;
        setShownMoves(next.moves);
      } else if (next.moves.length > receivedMoveCountRef.current) {
        playbackQueueRef.current.push(...next.moves.slice(receivedMoveCountRef.current));
        receivedMoveCountRef.current = next.moves.length;
        if (playbackTimerRef.current === null) {
          playNextMove();
        }
      }
      setRoom(next);
      setSelectedCards([]);
    },
    [clearMovePlayback, playNextMove],
  );

  const refreshRoom = useCallback(async (roomId: string) => {
    const next = await fetchLandlordRoom(roomId);
    applyRoom(next);
  }, [applyRoom]);

  useEffect(() => {
    if (!enabled) {
      setRoom(null);
      setRooms([]);
      clearMovePlayback();
      return;
    }
    void refreshLobby().catch((cause) => setError(cause instanceof Error ? cause.message : "无法加载房间"));
  }, [clearMovePlayback, enabled, refreshLobby]);

  useEffect(() => clearMovePlayback, [clearMovePlayback]);

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
  const shownLastPlayedIndex = useMemo(() => {
    for (let index = shownMoves.length - 1; index >= 0; index -= 1) {
      if (shownMoves[index].cards.length > 0) {
        return index;
      }
    }
    return -1;
  }, [shownMoves]);
  const shownLastPlay = shownLastPlayedIndex >= 0 ? shownMoves[shownLastPlayedIndex] : undefined;
  const passPlayerIds = useMemo(() => {
    if (!room || shownLastPlayedIndex < 0) {
      return new Set<string>();
    }
    return new Set(
      shownMoves
        .slice(shownLastPlayedIndex + 1)
        .filter((move) => move.action === "不要")
        .map((move) => move.userId),
    );
  }, [room, shownLastPlayedIndex, shownMoves]);
  const winner = room?.players.find((player) => player.userId === room.winnerId);
  const losingPlayers = players.filter((player) => player.userId !== room?.winnerId);

  function toggleRemainingHand(userId: string) {
    setRevealedHandIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  }

  async function run(action: () => Promise<LandlordRoom>) {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      applyRoom(next);
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
            clearMovePlayback();
            receivedRoomIdRef.current = "";
            receivedMoveCountRef.current = 0;
            shownMovesRef.current = [];
            setShownMoves([]);
            setRevealedHandIds([]);
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
        <div className="landlord-table-felt" aria-hidden="true" />
        <div className="landlord-bottom-cards">
          <span className="landlord-bottom-label">底牌</span>
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
            const self = player?.userId === context.auth?.id;
            const playedCards = player?.userId === shownLastPlay?.userId ? (shownLastPlay?.cards ?? []) : [];
            const passed = player ? passPlayerIds.has(player.userId) : false;
            return (
              <div
                className={`landlord-player ${playerSeatClass(seat, currentPlayer)} ${active ? "active" : ""} ${self ? "self" : ""}`}
                key={seat}
              >
                <div className="landlord-seat-avatar">
                  <LandlordAvatar player={player} />
                  {player?.landlord ? <Crown className="landlord-crown" size={12} aria-label="地主" /> : null}
                  {active ? <span className="landlord-turn-pulse" aria-label="当前操作玩家" /> : null}
                </div>
                <div className="landlord-player-meta">
                  <strong>{playerName(player)}</strong>
                  <small>{playerStatus(player)}</small>
                </div>
                {player && !self && room.status !== "WAITING" ? <PlayerCardBacks count={player.handCount} /> : null}
                {player && (playedCards.length || passed) ? (
                  <div
                    className={`landlord-seat-action ${playedCards.length ? "played" : "passed"}`}
                    key={`${player.userId}-${playedCards.join("-")}-${passed}`}
                  >
                    {playedCards.length ? (
                      <div className="landlord-seat-play-cards">
                        {playedCards.map((card) => (
                          <span key={card}>{cardRank(card)}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="landlord-pass-copy">不要</span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {room.hand.length ? (
          <div className="landlord-hand landlord-self-hand">
            <span className="landlord-self-hand-label">你的手牌</span>
            <div className="landlord-self-hand-cards">
              {room.hand.map((card) => (
                <button
                  key={card}
                  className={`landlord-card ${selectedCards.includes(card) ? "selected" : ""} ${isJoker(card) ? "joker" : ""} ${isRedCard(card) ? "red" : ""}`}
                  type="button"
                  disabled={!canAct || room.status !== "PLAYING"}
                  onClick={() => toggleCard(card)}
                >
                  <strong>{cardRank(card)}</strong>
                  <span>{cardSuit(card)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
          {room.ownerId === context.auth?.id && room.players.length < 3 ? (
            <button type="button" disabled={busy} onClick={() => void run(() => fillLandlordBots(room.id))}>
              <Bot size={15} /> 补齐人机
            </button>
          ) : null}
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
      ) : null}
      {room.status === "FINISHED" ? (
        <section className="landlord-settlement" role="dialog" aria-labelledby="landlord-settlement-title">
          <div className="landlord-settlement-backdrop" aria-hidden="true" />
          <div className="landlord-settlement-panel">
            <header className="landlord-settlement-head">
              <span className="landlord-settlement-medal">
                <Trophy size={21} />
              </span>
              <div>
                <span>本局结算</span>
                <h2 id="landlord-settlement-title">{winner?.userId === context.auth?.id ? "恭喜获胜" : "牌局结束"}</h2>
              </div>
              <strong>底分 {Math.max(1, room.highestBid)}</strong>
            </header>

            <article className="landlord-winner-card">
              <div className="landlord-settlement-avatar">
                <LandlordAvatar player={winner} />
                {winner?.landlord ? <Crown size={13} /> : null}
              </div>
              <div>
                <span>本局胜者</span>
                <strong>{playerName(winner)}</strong>
                <small>{winner?.landlord ? "地主" : "农民阵营"}</small>
              </div>
              <b className={winner && winner.settlementScore >= 0 ? "positive" : "negative"}>
                {winner && winner.settlementScore > 0 ? "+" : ""}
                {winner?.settlementScore ?? 0}
              </b>
            </article>

            <div className="landlord-settlement-loser-list">
              <div className="landlord-settlement-section-title">
                <span>其余玩家</span>
                <small>可查看本局剩余手牌</small>
              </div>
              {losingPlayers.map((player) => {
                const handVisible = revealedHandIds.includes(player.userId);
                return (
                  <article className="landlord-loser-card" key={player.userId}>
                    <div className="landlord-settlement-avatar small">
                      <LandlordAvatar player={player} />
                    </div>
                    <div className="landlord-loser-meta">
                      <strong>{playerName(player)}</strong>
                      <small>
                        {player.landlord ? "地主" : "农民"} · 剩余 {player.handCount} 张
                      </small>
                    </div>
                    <b className={player.settlementScore >= 0 ? "positive" : "negative"}>
                      {player.settlementScore > 0 ? "+" : ""}
                      {player.settlementScore}
                    </b>
                    <button type="button" onClick={() => toggleRemainingHand(player.userId)}>
                      {handVisible ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      {handVisible ? "收起手牌" : "查看手牌"}
                    </button>
                    {handVisible ? (
                      <div className="landlord-revealed-hand">
                        {player.remainingHand.map((card) => (
                          <span className={isRedCard(card) ? "red" : ""} key={card}>
                            <strong>{cardRank(card)}</strong>
                            <small>{cardSuit(card)}</small>
                          </span>
                        ))}
                        {!player.remainingHand.length ? <small>已无剩余手牌</small> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <footer className="landlord-settlement-actions">
              <button
                className="landlord-primary"
                type="button"
                onClick={() => {
                  setRoom(null);
                  clearMovePlayback();
                  receivedRoomIdRef.current = "";
                  receivedMoveCountRef.current = 0;
                  shownMovesRef.current = [];
                  setShownMoves([]);
                  setRevealedHandIds([]);
                  void refreshLobby();
                }}
              >
                返回大厅
              </button>
            </footer>
          </div>
        </section>
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
