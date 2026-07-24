package app.forgedesk.infrastructure.translation;

import app.forgedesk.domain.time.PlatformClock;
import app.forgedesk.domain.translation.TranslationConfiguration;
import app.forgedesk.domain.translation.TranslationConfigurationRepository;
import app.forgedesk.domain.translation.TranslationCredentials;
import app.forgedesk.domain.translation.TranslationProvider;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcTranslationConfigurationRepository implements TranslationConfigurationRepository {

  private final JdbcTemplate jdbc;

  private final PlatformClock clock;

  @Override
  public Optional<TranslationConfiguration> find(String userId, TranslationProvider provider) {
    return jdbc
        .query(
            "SELECT app_id, app_key, app_secret, updated_at FROM translation_configurations "
                + "WHERE user_id = ? AND provider = ?",
            (resultSet, rowNum) ->
                new TranslationConfiguration(
                    provider,
                    new TranslationCredentials(
                        resultSet.getString("app_id"),
                        resultSet.getString("app_key"),
                        resultSet.getString("app_secret")),
                    resultSet.getString("updated_at")),
            userId,
            provider.id())
        .stream()
        .findFirst();
  }

  @Override
  public TranslationConfiguration save(
      String userId, TranslationProvider provider, TranslationCredentials credentials) {
    String updatedAt = clock.now();
    jdbc.update(
        "INSERT INTO translation_configurations "
            + "(user_id, provider, app_id, app_key, app_secret, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE app_id = VALUES(app_id), app_key = VALUES(app_key), "
            + "app_secret = VALUES(app_secret), updated_at = VALUES(updated_at)",
        userId,
        provider.id(),
        credentials.appId(),
        credentials.appKey(),
        credentials.appSecret(),
        updatedAt);
    return new TranslationConfiguration(provider, credentials, updatedAt);
  }

  @Override
  public long configuredUserCount() {
    Long count =
        jdbc.queryForObject(
            "SELECT COUNT(DISTINCT user_id) FROM translation_configurations", Long.class);
    return count == null ? 0 : count;
  }
}
