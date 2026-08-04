package app.forgedesk.domain.landlord;

import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Redis-persisted aggregate state. It never crosses the API boundary without redaction. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LandlordRoomState {

  private String id;
  private String ownerId;
  private String status;
  private List<Player> players = new ArrayList<>();
  private List<String> bottomCards = new ArrayList<>();
  private int turnSeat;
  private int bidTurnSeat;
  private int bidCount;
  private int highestBid;
  private int highestBidSeat = -1;
  private int lastSeat = -1;
  private List<String> lastCards = new ArrayList<>();
  private int passCount;
  private String winnerId = "";
  private List<Move> moves = new ArrayList<>();
  private String updatedAt;

  @Data
  @NoArgsConstructor
  @AllArgsConstructor
  public static class Player {
    private String userId;
    private String displayName;
    private int seat;
    private boolean ready;
    private List<String> hand = new ArrayList<>();
  }

  @Data
  @NoArgsConstructor
  @AllArgsConstructor
  public static class Move {
    private String userId;
    private String displayName;
    private String action;
    private List<String> cards = new ArrayList<>();
    private int bid;
    private String createdAt;
  }
}
