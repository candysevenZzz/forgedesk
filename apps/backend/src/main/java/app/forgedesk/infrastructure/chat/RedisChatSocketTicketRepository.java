package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatSocketTicket;
import app.forgedesk.domain.chat.ChatSocketTicketRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RedisChatSocketTicketRepository implements ChatSocketTicketRepository {

  private static final String KEY_PREFIX = "forgedesk:chat-ticket:";

  private final StringRedisTemplate redis;

  @Override
  public void save(ChatSocketTicket ticket) {
    Duration lifetime = Duration.between(Instant.now(), parse(ticket.expiresAt()));
    if (lifetime.isNegative() || lifetime.isZero()) {
      return;
    }
    redis.opsForValue().set(key(ticket.tokenHash()), ticket.userId(), lifetime);
  }

  @Override
  public Optional<ChatSocketTicket> consume(String tokenHash) {
    String userId = redis.opsForValue().getAndDelete(key(tokenHash));
    if (userId == null || userId.isBlank()) {
      return Optional.empty();
    }
    return Optional.of(
        new ChatSocketTicket(tokenHash, userId, Instant.now().plusSeconds(60).toString()));
  }

  @Override
  public void removeExpired(String now) {
    // Redis TTL handles expiration without scanning process memory or a shared keyspace.
  }

  private String key(String tokenHash) {
    return KEY_PREFIX + tokenHash;
  }

  private Instant parse(String value) {
    try {
      return Instant.parse(value);
    } catch (Exception exception) {
      return Instant.EPOCH;
    }
  }
}
