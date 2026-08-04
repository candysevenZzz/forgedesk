package app.forgedesk.domain.landlord;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Standard three-player Dou Dizhu combination recognition and comparison. */
public final class LandlordCardRules {

  private static final List<String> RANKS =
      List.of("3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "SJ", "BJ");

  private LandlordCardRules() {}

  public static List<String> sort(List<String> cards) {
    return cards.stream().sorted(Comparator.comparingInt(LandlordCardRules::rank)).toList();
  }

  public static Combination evaluate(List<String> cards) {
    if (cards == null || cards.isEmpty()) {
      throw new LandlordGameException("请选择要出的牌");
    }
    Map<Integer, Integer> counts = counts(cards);
    List<Integer> ranks = counts.keySet().stream().sorted().toList();
    int size = cards.size();
    if (size == 2 && counts.containsKey(13) && counts.containsKey(14)) {
      return new Combination("ROCKET", 14, 1);
    }
    if (ranks.size() == 1) {
      int count = counts.get(ranks.getFirst());
      if (count == 1) {
        return new Combination("SINGLE", ranks.getFirst(), 1);
      }
      if (count == 2) {
        return new Combination("PAIR", ranks.getFirst(), 1);
      }
      if (count == 3) {
        return new Combination("TRIPLE", ranks.getFirst(), 1);
      }
      if (count == 4) {
        return new Combination("BOMB", ranks.getFirst(), 1);
      }
    }
    int triple = rankWithCount(counts, 3);
    if (triple >= 0 && size == 4) {
      return new Combination("TRIPLE_SINGLE", triple, 1);
    }
    if (triple >= 0 && size == 5 && counts.values().stream().anyMatch(count -> count == 2)) {
      return new Combination("TRIPLE_PAIR", triple, 1);
    }
    if (size >= 5 && allCount(counts, 1) && consecutive(ranks) && ranks.getLast() < 12) {
      return new Combination("STRAIGHT", ranks.getLast(), size);
    }
    if (size >= 6
        && size % 2 == 0
        && allCount(counts, 2)
        && consecutive(ranks)
        && ranks.getLast() < 12) {
      return new Combination("PAIR_STRAIGHT", ranks.getLast(), size / 2);
    }
    Combination airplane = airplane(counts, size);
    if (airplane != null) {
      return airplane;
    }
    int four = rankWithCount(counts, 4);
    if (four >= 0 && size == 6) {
      return new Combination("FOUR_TWO_SINGLE", four, 1);
    }
    if (four >= 0
        && size == 8
        && counts.values().stream().filter(count -> count == 2).count() == 2) {
      return new Combination("FOUR_TWO_PAIR", four, 1);
    }
    throw new LandlordGameException("不是可出的斗地主牌型");
  }

  public static boolean beats(List<String> cards, List<String> previous) {
    if (previous == null || previous.isEmpty()) {
      return true;
    }
    Combination next = evaluate(cards);
    Combination current = evaluate(previous);
    if (next.type().equals("ROCKET")) {
      return true;
    }
    if (current.type().equals("ROCKET")) {
      return false;
    }
    if (next.type().equals("BOMB") && !current.type().equals("BOMB")) {
      return true;
    }
    return next.type().equals(current.type())
        && next.length() == current.length()
        && next.mainRank() > current.mainRank();
  }

  private static Combination airplane(Map<Integer, Integer> counts, int size) {
    List<Integer> triples =
        counts.entrySet().stream()
            .filter(entry -> entry.getValue() == 3)
            .map(Map.Entry::getKey)
            .sorted()
            .toList();
    if (triples.size() < 2 || triples.getLast() >= 12 || !consecutive(triples)) {
      return null;
    }
    int length = triples.size();
    if (size == length * 3) {
      return new Combination("AIRPLANE", triples.getLast(), length);
    }
    List<Integer> wings =
        counts.entrySet().stream()
            .filter(entry -> !triples.contains(entry.getKey()))
            .map(Map.Entry::getValue)
            .toList();
    if (size == length * 4
        && wings.size() == length
        && wings.stream().allMatch(count -> count == 1)) {
      return new Combination("AIRPLANE_SINGLE", triples.getLast(), length);
    }
    if (size == length * 5
        && wings.size() == length
        && wings.stream().allMatch(count -> count == 2)) {
      return new Combination("AIRPLANE_PAIR", triples.getLast(), length);
    }
    return null;
  }

  private static Map<Integer, Integer> counts(List<String> cards) {
    Map<Integer, Integer> counts = new HashMap<>();
    for (String card : cards) {
      counts.merge(rank(card), 1, Integer::sum);
    }
    return counts;
  }

  private static int rankWithCount(Map<Integer, Integer> counts, int expected) {
    return counts.entrySet().stream()
        .filter(entry -> entry.getValue() == expected)
        .map(Map.Entry::getKey)
        .findFirst()
        .orElse(-1);
  }

  private static boolean allCount(Map<Integer, Integer> counts, int expected) {
    return counts.values().stream().allMatch(count -> count == expected);
  }

  private static boolean consecutive(List<Integer> ranks) {
    for (int index = 1; index < ranks.size(); index += 1) {
      if (ranks.get(index) != ranks.get(index - 1) + 1) {
        return false;
      }
    }
    return true;
  }

  private static int rank(String card) {
    String value = card.substring(1);
    int rank = RANKS.indexOf(value);
    if (rank < 0) {
      throw new LandlordGameException("牌面数据无效");
    }
    return rank;
  }

  public record Combination(String type, int mainRank, int length) {}
}
