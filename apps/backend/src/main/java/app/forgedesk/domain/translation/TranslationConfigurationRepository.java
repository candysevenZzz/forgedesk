package app.forgedesk.domain.translation;

import java.util.Optional;

public interface TranslationConfigurationRepository {

  Optional<TranslationConfiguration> find(String userId, TranslationProvider provider);

  TranslationConfiguration save(
      String userId, TranslationProvider provider, TranslationCredentials credentials);

  long configuredUserCount();
}
