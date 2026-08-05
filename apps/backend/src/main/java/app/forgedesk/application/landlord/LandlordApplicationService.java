package app.forgedesk.application.landlord;

import app.forgedesk.domain.auth.UserAccount;
import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.landlord.LandlordBotStrategy;
import app.forgedesk.domain.landlord.LandlordCardRules;
import app.forgedesk.domain.landlord.LandlordGameException;
import app.forgedesk.domain.landlord.LandlordRealtimeNotifier;
import app.forgedesk.domain.landlord.LandlordRoomRepository;
import app.forgedesk.domain.landlord.LandlordRoomState;
import app.forgedesk.domain.time.PlatformClock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Server-authoritative game flow. Redis stores the aggregate; local objects only serialize one room
 * mutation.
 */
@Service
@RequiredArgsConstructor
public class LandlordApplicationService {

  private static final List<String> BOT_NAMES = List.of("小虎机器人", "橘子 AI");

  private final LandlordRoomRepository rooms;
  private final UserAccountRepository accounts;
  private final LandlordRealtimeNotifier notifier;
  private final PlatformClock clock;
  private final Map<String, Object> roomLocks = new ConcurrentHashMap<>();

  public List<RoomSummary> waitingRooms() {
    return rooms.findWaitingRooms().stream()
        .map(this::summary)
        .sorted(Comparator.comparing(RoomSummary::updatedAt).reversed())
        .toList();
  }

  public RoomView create(String userId) {
    UserAccount owner = account(userId);
    String now = clock.now();
    LandlordRoomState room = new LandlordRoomState();
    room.setId(UUID.randomUUID().toString());
    room.setOwnerId(userId);
    room.setStatus("WAITING");
    room.setPlayers(new ArrayList<>(List.of(player(owner, 0))));
    room.setUpdatedAt(now);
    rooms.save(room);
    return view(room, userId);
  }

  public RoomView join(String userId, String roomId) {
    return mutateJoining(
        roomId,
        userId,
        room -> {
          if (!"WAITING".equals(room.getStatus())) {
            throw new LandlordGameException("该房间已开始对局");
          }
          if (player(room, userId) == null) {
            if (room.getPlayers().size() >= 3) {
              throw new LandlordGameException("房间已满");
            }
            room.getPlayers().add(player(account(userId), room.getPlayers().size()));
          }
        });
  }

  /** Fills every vacant seat with a ready AI player. Only the room owner can change the lineup. */
  public RoomView fillBots(String userId, String roomId) {
    mutate(
        roomId,
        userId,
        room -> {
          if (!"WAITING".equals(room.getStatus())) {
            throw new LandlordGameException("对局已经开始，无法补充人机");
          }
          if (!room.getOwnerId().equals(userId)) {
            throw new LandlordGameException("只有房主可以补充人机");
          }
          while (room.getPlayers().size() < 3) {
            room.getPlayers().add(bot(room, room.getPlayers().size()));
          }
          startWhenReady(room);
        });
    advanceBots(roomId);
    return room(userId, roomId);
  }

  public RoomView room(String userId, String roomId) {
    LandlordRoomState room = requireRoom(roomId);
    requirePlayer(room, userId);
    return view(room, userId);
  }

  public RoomView ready(String userId, String roomId) {
    mutate(
        roomId,
        userId,
        room -> {
          LandlordRoomState.Player player = requirePlayer(room, userId);
          if (!"WAITING".equals(room.getStatus())) {
            throw new LandlordGameException("对局已经开始");
          }
          player.setReady(!player.isReady());
          startWhenReady(room);
        });
    advanceBots(roomId);
    return room(userId, roomId);
  }

  public RoomView bid(String userId, String roomId, int bid) {
    mutate(
        roomId,
        userId,
        room -> {
          if (!"BIDDING".equals(room.getStatus())) {
            throw new LandlordGameException("当前不在叫地主阶段");
          }
          LandlordRoomState.Player player = requirePlayer(room, userId);
          if (player.getSeat() != room.getBidTurnSeat()) {
            throw new LandlordGameException("还未轮到你叫地主");
          }
          if (bid < 0 || bid > 3 || (bid > 0 && bid <= room.getHighestBid())) {
            throw new LandlordGameException("叫分必须高于当前最高分，或选择不叫");
          }
          room.getMoves().add(move(player, bid == 0 ? "不叫" : "叫" + bid + "分", List.of(), bid));
          room.setBidCount(room.getBidCount() + 1);
          if (bid > room.getHighestBid()) {
            room.setHighestBid(bid);
            room.setHighestBidSeat(player.getSeat());
          }
          if (bid == 3 || room.getBidCount() == 3) {
            if (room.getHighestBidSeat() < 0) {
              deal(room);
            } else {
              beginPlaying(room);
            }
          } else {
            room.setBidTurnSeat(nextSeat(player.getSeat()));
          }
        });
    advanceBots(roomId);
    return room(userId, roomId);
  }

  public RoomView play(String userId, String roomId, List<String> cards) {
    mutate(
        roomId,
        userId,
        room -> {
          if (!"PLAYING".equals(room.getStatus())) {
            throw new LandlordGameException("当前不在出牌阶段");
          }
          LandlordRoomState.Player player = requirePlayer(room, userId);
          if (player.getSeat() != room.getTurnSeat()) {
            throw new LandlordGameException("还未轮到你出牌");
          }
          List<String> sorted = LandlordCardRules.sort(cards == null ? List.of() : cards);
          List<String> remaining = new ArrayList<>(player.getHand());
          for (String card : sorted) {
            if (!remaining.remove(card)) {
              throw new LandlordGameException("手牌中不存在该牌");
            }
          }
          if (!LandlordCardRules.beats(sorted, room.getLastCards())) {
            throw new LandlordGameException("牌型不能压过上一手");
          }
          LandlordCardRules.evaluate(sorted);
          player.setHand(remaining);
          room.setLastCards(sorted);
          room.setLastSeat(player.getSeat());
          room.setPassCount(0);
          room.getMoves().add(move(player, "出牌", sorted, 0));
          if (remaining.isEmpty()) {
            room.setStatus("FINISHED");
            room.setWinnerId(player.getUserId());
          } else {
            room.setTurnSeat(nextSeat(player.getSeat()));
          }
        });
    advanceBots(roomId);
    return room(userId, roomId);
  }

  public RoomView pass(String userId, String roomId) {
    mutate(
        roomId,
        userId,
        room -> {
          if (!"PLAYING".equals(room.getStatus())) {
            throw new LandlordGameException("当前不在出牌阶段");
          }
          LandlordRoomState.Player player = requirePlayer(room, userId);
          if (player.getSeat() != room.getTurnSeat()) {
            throw new LandlordGameException("还未轮到你操作");
          }
          if (room.getLastCards().isEmpty() || room.getLastSeat() == player.getSeat()) {
            throw new LandlordGameException("当前必须先出牌");
          }
          room.getMoves().add(move(player, "不要", List.of(), 0));
          room.setPassCount(room.getPassCount() + 1);
          if (room.getPassCount() == 2) {
            room.setTurnSeat(room.getLastSeat());
            room.setLastCards(new ArrayList<>());
            room.setLastSeat(-1);
            room.setPassCount(0);
          } else {
            room.setTurnSeat(nextSeat(player.getSeat()));
          }
        });
    advanceBots(roomId);
    return room(userId, roomId);
  }

  private RoomView mutate(String roomId, String userId, RoomMutation mutation) {
    return mutate(roomId, userId, true, mutation);
  }

  /**
   * Joining is the only state transition initiated by a user who is not yet a room member. It must
   * still use the same per-room lock and persistence path as every other transition.
   */
  private RoomView mutateJoining(String roomId, String userId, RoomMutation mutation) {
    return mutate(roomId, userId, false, mutation);
  }

  private RoomView mutate(
      String roomId, String userId, boolean requireExistingPlayer, RoomMutation mutation) {
    Object lock = roomLocks.computeIfAbsent(roomId, ignored -> new Object());
    synchronized (lock) {
      LandlordRoomState room = requireRoom(roomId);
      if (requireExistingPlayer) {
        requirePlayer(room, userId);
      }
      mutation.apply(room);
      room.setUpdatedAt(clock.now());
      rooms.save(room);
      notifier.roomChanged(
          room.getPlayers().stream().map(LandlordRoomState.Player::getUserId).toList(),
          room.getId());
      return view(room, userId);
    }
  }

  private void deal(LandlordRoomState room) {
    List<String> deck = deck();
    Collections.shuffle(deck);
    for (LandlordRoomState.Player player : room.getPlayers()) {
      int from = player.getSeat() * 17;
      player.setHand(new ArrayList<>(LandlordCardRules.sort(deck.subList(from, from + 17))));
    }
    room.setBottomCards(new ArrayList<>(deck.subList(51, 54)));
    room.setStatus("BIDDING");
    room.setBidTurnSeat((int) (Math.random() * 3));
    room.setBidCount(0);
    room.setHighestBid(0);
    room.setHighestBidSeat(-1);
    room.setLastCards(new ArrayList<>());
    room.setLastSeat(-1);
    room.setPassCount(0);
    room.setMoves(new ArrayList<>());
  }

  /** Starts the game exactly once when a complete room has all players ready. */
  private void startWhenReady(LandlordRoomState room) {
    if (room.getPlayers().size() == 3
        && room.getPlayers().stream().allMatch(LandlordRoomState.Player::isReady)) {
      deal(room);
    }
  }

  private void beginPlaying(LandlordRoomState room) {
    LandlordRoomState.Player landlord = room.getPlayers().get(room.getHighestBidSeat());
    List<String> hand = new ArrayList<>(landlord.getHand());
    hand.addAll(room.getBottomCards());
    landlord.setHand(new ArrayList<>(LandlordCardRules.sort(hand)));
    room.setStatus("PLAYING");
    room.setTurnSeat(landlord.getSeat());
    room.getMoves().add(move(landlord, "成为地主", List.of(), room.getHighestBid()));
  }

  /**
   * Advances consecutive AI turns in one synchronized room update until a human player must act.
   */
  private void advanceBots(String roomId) {
    Object lock = roomLocks.computeIfAbsent(roomId, ignored -> new Object());
    synchronized (lock) {
      LandlordRoomState room = requireRoom(roomId);
      boolean changed = false;
      int remainingTurns = 16;
      while (remainingTurns-- > 0) {
        LandlordRoomState.Player current = currentBot(room);
        if (current == null) {
          break;
        }
        if ("BIDDING".equals(room.getStatus())) {
          botBid(room, current);
          changed = true;
          continue;
        }
        if ("PLAYING".equals(room.getStatus())) {
          botPlay(room, current);
          changed = true;
          continue;
        }
        break;
      }
      if (changed) {
        room.setUpdatedAt(clock.now());
        rooms.save(room);
        notifier.roomChanged(
            room.getPlayers().stream().map(LandlordRoomState.Player::getUserId).toList(),
            room.getId());
      }
    }
  }

  private LandlordRoomState.Player currentBot(LandlordRoomState room) {
    int seat = "BIDDING".equals(room.getStatus()) ? room.getBidTurnSeat() : room.getTurnSeat();
    if (!"BIDDING".equals(room.getStatus()) && !"PLAYING".equals(room.getStatus())) {
      return null;
    }
    return room.getPlayers().stream()
        .filter(player -> player.getSeat() == seat && player.isBot())
        .findFirst()
        .orElse(null);
  }

  private void botBid(LandlordRoomState room, LandlordRoomState.Player player) {
    int bid = LandlordBotStrategy.bid(player.getHand());
    if (room.getHighestBid() == 0 && room.getBidCount() == 2) {
      bid = Math.max(bid, 1);
    }
    if (bid <= room.getHighestBid()) {
      bid = 0;
    }
    room.getMoves().add(move(player, bid == 0 ? "不叫" : "叫" + bid + "分", List.of(), bid));
    room.setBidCount(room.getBidCount() + 1);
    if (bid > room.getHighestBid()) {
      room.setHighestBid(bid);
      room.setHighestBidSeat(player.getSeat());
    }
    if (bid == 3 || room.getBidCount() == 3) {
      if (room.getHighestBidSeat() < 0) {
        deal(room);
      } else {
        beginPlaying(room);
      }
    } else {
      room.setBidTurnSeat(nextSeat(player.getSeat()));
    }
  }

  private void botPlay(LandlordRoomState room, LandlordRoomState.Player player) {
    List<String> cards = LandlordBotStrategy.cards(player.getHand(), room.getLastCards());
    if (cards.isEmpty()) {
      room.getMoves().add(move(player, "不要", List.of(), 0));
      room.setPassCount(room.getPassCount() + 1);
      if (room.getPassCount() == 2) {
        room.setTurnSeat(room.getLastSeat());
        room.setLastCards(new ArrayList<>());
        room.setLastSeat(-1);
        room.setPassCount(0);
      } else {
        room.setTurnSeat(nextSeat(player.getSeat()));
      }
      return;
    }
    List<String> remaining = new ArrayList<>(player.getHand());
    cards.forEach(remaining::remove);
    player.setHand(remaining);
    room.setLastCards(cards);
    room.setLastSeat(player.getSeat());
    room.setPassCount(0);
    room.getMoves().add(move(player, "出牌", cards, 0));
    if (remaining.isEmpty()) {
      room.setStatus("FINISHED");
      room.setWinnerId(player.getUserId());
    } else {
      room.setTurnSeat(nextSeat(player.getSeat()));
    }
  }

  private List<String> deck() {
    List<String> deck = new ArrayList<>();
    for (String suit : List.of("S", "H", "C", "D")) {
      for (String rank :
          List.of("3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2")) {
        deck.add(suit + rank);
      }
    }
    deck.add("XSJ");
    deck.add("XBJ");
    return deck;
  }

  private RoomSummary summary(LandlordRoomState room) {
    return new RoomSummary(
        room.getId(),
        room.getPlayers().stream().map(LandlordRoomState.Player::getDisplayName).toList(),
        room.getUpdatedAt());
  }

  private RoomView view(LandlordRoomState room, String userId) {
    LandlordRoomState.Player current = requirePlayer(room, userId);
    boolean showBottom = "PLAYING".equals(room.getStatus()) || "FINISHED".equals(room.getStatus());
    return new RoomView(
        room.getId(),
        room.getStatus(),
        room.getOwnerId(),
        room.getPlayers().stream().map(player -> playerView(player, room)).toList(),
        current.getHand(),
        showBottom ? room.getBottomCards() : List.of(),
        room.getTurnSeat(),
        room.getBidTurnSeat(),
        room.getHighestBid(),
        room.getHighestBidSeat(),
        room.getLastCards(),
        room.getLastSeat(),
        room.getWinnerId(),
        room.getMoves());
  }

  private PlayerView playerView(LandlordRoomState.Player player, LandlordRoomState room) {
    String avatarUrl =
        player.isBot()
            ? ""
            : accounts
                .findById(player.getUserId())
                .map(this::avatarUrl)
                .orElse(player.getAvatarUrl());
    return new PlayerView(
        player.getUserId(),
        player.getDisplayName(),
        player.getSeat(),
        player.isReady(),
        player.isBot(),
        avatarUrl == null ? "" : avatarUrl,
        player.getHand().size(),
        room.getHighestBidSeat() == player.getSeat(),
        "FINISHED".equals(room.getStatus()) ? LandlordCardRules.sort(player.getHand()) : List.of(),
        settlementScore(player, room));
  }

  /**
   * Computes the score delta for this round. The winning side receives the base bid from each
   * opposing seat; the landlord therefore wins or loses twice the base bid.
   */
  private int settlementScore(LandlordRoomState.Player player, LandlordRoomState room) {
    if (!"FINISHED".equals(room.getStatus()) || room.getWinnerId().isBlank()) {
      return 0;
    }
    LandlordRoomState.Player winner = player(room, room.getWinnerId());
    if (winner == null) {
      return 0;
    }
    int baseScore = Math.max(1, room.getHighestBid());
    boolean landlordWon = winner.getSeat() == room.getHighestBidSeat();
    if (player.getSeat() == room.getHighestBidSeat()) {
      return landlordWon ? baseScore * 2 : -baseScore * 2;
    }
    return landlordWon ? -baseScore : baseScore;
  }

  private LandlordRoomState requireRoom(String roomId) {
    return rooms.find(roomId).orElseThrow(() -> new LandlordGameException("房间不存在或已过期"));
  }

  private LandlordRoomState.Player requirePlayer(LandlordRoomState room, String userId) {
    LandlordRoomState.Player player = player(room, userId);
    if (player == null) {
      throw new LandlordGameException("你不是该房间的玩家");
    }
    return player;
  }

  private LandlordRoomState.Player player(LandlordRoomState room, String userId) {
    return room.getPlayers().stream()
        .filter(item -> item.getUserId().equals(userId))
        .findFirst()
        .orElse(null);
  }

  private LandlordRoomState.Player player(UserAccount account, int seat) {
    return new LandlordRoomState.Player(
        account.id(),
        account.displayName(),
        seat,
        false,
        false,
        avatarUrl(account),
        new ArrayList<>());
  }

  private LandlordRoomState.Player bot(LandlordRoomState room, int seat) {
    int botIndex = (int) room.getPlayers().stream().filter(LandlordRoomState.Player::isBot).count();
    String name = BOT_NAMES.get(botIndex % BOT_NAMES.size());
    return new LandlordRoomState.Player(
        "bot:" + room.getId() + ":" + seat, name, seat, true, true, "", new ArrayList<>());
  }

  private String avatarUrl(UserAccount account) {
    if (account.avatarVersion().isBlank()) {
      return "";
    }
    return "/api/auth/avatars/" + account.id() + "?v=" + account.avatarVersion();
  }

  private UserAccount account(String userId) {
    return accounts.findById(userId).orElseThrow(() -> new LandlordGameException("用户不存在"));
  }

  private LandlordRoomState.Move move(
      LandlordRoomState.Player player, String action, List<String> cards, int bid) {
    return new LandlordRoomState.Move(
        player.getUserId(), player.getDisplayName(), action, cards, bid, clock.now());
  }

  private int nextSeat(int seat) {
    return (seat + 1) % 3;
  }

  @FunctionalInterface
  private interface RoomMutation {
    void apply(LandlordRoomState room);
  }

  public record RoomSummary(String id, List<String> playerNames, String updatedAt) {}

  public record PlayerView(
      String userId,
      String displayName,
      int seat,
      boolean ready,
      boolean bot,
      String avatarUrl,
      int handCount,
      boolean landlord,
      List<String> remainingHand,
      int settlementScore) {}

  public record RoomView(
      String id,
      String status,
      String ownerId,
      List<PlayerView> players,
      List<String> hand,
      List<String> bottomCards,
      int turnSeat,
      int bidTurnSeat,
      int highestBid,
      int highestBidSeat,
      List<String> lastCards,
      int lastSeat,
      String winnerId,
      List<LandlordRoomState.Move> moves) {}
}
