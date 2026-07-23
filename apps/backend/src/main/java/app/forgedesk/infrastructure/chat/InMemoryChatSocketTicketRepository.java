package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatSocketTicket;
import app.forgedesk.domain.chat.ChatSocketTicketRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class InMemoryChatSocketTicketRepository implements ChatSocketTicketRepository {

  private final Map<String, ChatSocketTicket> tickets = new ConcurrentHashMap<>();

  @Override
  public void save(ChatSocketTicket ticket) {
    tickets.put(ticket.tokenHash(), ticket);
  }

  @Override
  public Optional<ChatSocketTicket> consume(String tokenHash) {
    return Optional.ofNullable(tickets.remove(tokenHash));
  }

  @Override
  public void removeExpired(String now) {
    Instant threshold = parse(now);
    tickets.entrySet().removeIf(entry -> !parse(entry.getValue().expiresAt()).isAfter(threshold));
  }

  private Instant parse(String value) {
    try {
      return Instant.parse(value);
    } catch (Exception exception) {
      return Instant.EPOCH;
    }
  }
}
