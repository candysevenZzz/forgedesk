package app.forgedesk.domain.landlord;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Conservative, deterministic AI decisions for a standard room. State transitions remain in the
 * application service; this policy only selects a legal bid or card combination.
 */
public final class LandlordBotStrategy {

  private LandlordBotStrategy() {}

  public static int bid(List<String> hand) {
    int strength = 0;
    Map<String, Long> counts =
        hand.stream()
            .collect(
                Collectors.groupingBy(
                    card -> card.substring(1), LinkedHashMap::new, Collectors.counting()));
    strength += counts.getOrDefault("BJ", 0L) > 0 ? 2 : 0;
    strength += counts.getOrDefault("SJ", 0L) > 0 ? 1 : 0;
    strength += counts.getOrDefault("2", 0L).intValue();
    strength += counts.getOrDefault("A", 0L).intValue();
    strength += counts.values().stream().filter(count -> count == 4).count() * 2;
    if (strength >= 7) {
      return 3;
    }
    if (strength >= 4) {
      return 2;
    }
    return strength >= 2 ? 1 : 0;
  }

  public static List<String> cards(List<String> hand, List<String> previous) {
    List<String> sorted = LandlordCardRules.sort(hand);
    Map<String, List<String>> groups = new LinkedHashMap<>();
    for (String card : sorted) {
      groups.computeIfAbsent(card.substring(1), ignored -> new ArrayList<>()).add(card);
    }
    List<List<String>> candidates = new ArrayList<>();
    groups
        .values()
        .forEach(
            cards -> {
              candidates.add(List.of(cards.getFirst()));
              if (cards.size() >= 2) {
                candidates.add(cards.subList(0, 2));
              }
              if (cards.size() >= 3) {
                candidates.add(cards.subList(0, 3));
              }
              if (cards.size() == 4) {
                candidates.add(cards);
              }
            });
    if (groups.containsKey("SJ") && groups.containsKey("BJ")) {
      candidates.add(List.of(groups.get("SJ").getFirst(), groups.get("BJ").getFirst()));
    }
    return candidates.stream()
        .map(LandlordCardRules::sort)
        .filter(candidate -> LandlordCardRules.beats(candidate, previous))
        .findFirst()
        .orElse(List.of());
  }
}
