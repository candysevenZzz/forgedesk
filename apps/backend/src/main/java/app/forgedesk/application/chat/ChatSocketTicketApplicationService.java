package app.forgedesk.application.chat;

import app.forgedesk.domain.auth.SecureTokenService;
import app.forgedesk.domain.chat.ChatException;
import app.forgedesk.domain.chat.ChatSocketTicket;
import app.forgedesk.domain.chat.ChatSocketTicketRepository;
import app.forgedesk.domain.time.PlatformClock;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ChatSocketTicketApplicationService {

  private static final Duration TICKET_LIFETIME = Duration.ofMinutes(1);

  private final ChatSocketTicketRepository tickets;

  private final SecureTokenService tokens;

  private final PlatformClock clock;

  public String issue(String userId) {
    Instant now = clock.instant();
    tickets.removeExpired(clock.format(now));
    String ticket = tokens.nextToken(24);
    tickets.save(
        new ChatSocketTicket(
            tokens.fingerprint(ticket), userId, clock.format(now.plus(TICKET_LIFETIME))));
    return ticket;
  }

  public String consume(String ticket) {
    if (ticket == null || ticket.isBlank()) {
      throw new ChatException("聊天连接凭证无效或已过期");
    }
    ChatSocketTicket saved =
        tickets
            .consume(tokens.fingerprint(ticket))
            .orElseThrow(() -> new ChatException("聊天连接凭证无效或已过期"));
    if (!clock.instant().isBefore(parse(saved.expiresAt()))) {
      throw new ChatException("聊天连接凭证无效或已过期");
    }
    return saved.userId();
  }

  private Instant parse(String value) {
    try {
      return Instant.parse(value);
    } catch (Exception exception) {
      return Instant.EPOCH;
    }
  }
}
