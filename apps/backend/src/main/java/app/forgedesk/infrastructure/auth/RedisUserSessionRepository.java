package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.UserSession;
import app.forgedesk.domain.auth.UserSessionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RedisUserSessionRepository implements UserSessionRepository {

  private static final String KEY_PREFIX = "forgedesk:session:";
  private static final String INDEX_KEY = "forgedesk:session:expires";

  private final StringRedisTemplate redis;

  @Override
  public void save(UserSession session) {
    Instant expiresAt = parse(session.expiresAt());
    Duration lifetime = Duration.between(Instant.now(), expiresAt);
    if (lifetime.isNegative() || lifetime.isZero()) {
      return;
    }
    redis.opsForValue().set(key(session.tokenHash()), encode(session), lifetime);
    redis.opsForZSet().add(INDEX_KEY, session.tokenHash(), expiresAt.toEpochMilli());
  }

  @Override
  public Optional<UserSession> findByTokenHash(String tokenHash) {
    String value = redis.opsForValue().get(key(tokenHash));
    if (value == null || value.isBlank()) {
      redis.opsForZSet().remove(INDEX_KEY, tokenHash);
      return Optional.empty();
    }
    return Optional.of(decode(tokenHash, value));
  }

  @Override
  public void remove(String tokenHash) {
    redis.delete(key(tokenHash));
    redis.opsForZSet().remove(INDEX_KEY, tokenHash);
  }

  @Override
  public int activeCount() {
    redis.opsForZSet().removeRangeByScore(INDEX_KEY, 0, Instant.now().toEpochMilli());
    Long count = redis.opsForZSet().zCard(INDEX_KEY);
    return count == null ? 0 : Math.toIntExact(count);
  }

  private String key(String tokenHash) {
    return KEY_PREFIX + tokenHash;
  }

  private String encode(UserSession session) {
    return session.userId() + "\n" + session.createdAt() + "\n" + session.expiresAt();
  }

  private UserSession decode(String tokenHash, String value) {
    String[] fields = value.split("\\n", 3);
    if (fields.length != 3) {
      remove(tokenHash);
      throw new IllegalStateException("Redis 中的登录会话格式无效");
    }
    return new UserSession(tokenHash, fields[0], fields[1], fields[2]);
  }

  private Instant parse(String value) {
    try {
      return Instant.parse(value);
    } catch (Exception exception) {
      return Instant.EPOCH;
    }
  }
}
