package app.forgedesk.application.translation;

import static org.assertj.core.api.Assertions.assertThat;

import app.forgedesk.domain.translation.TranslationConfiguration;
import app.forgedesk.domain.translation.TranslationConfigurationRepository;
import app.forgedesk.domain.translation.TranslationCredentials;
import app.forgedesk.domain.translation.TranslationProvider;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class TranslationConfigurationApplicationServiceTest {

  @Test
  void storesCredentialsUnderTheCurrentUserOnly() {
    InMemoryConfigurationRepository repository = new InMemoryConfigurationRepository();
    TranslationConfigurationApplicationService service =
        new TranslationConfigurationApplicationService(repository);
    service.save(
        "11111111-1111-1111-1111-111111111111",
        "google",
        new TranslationConfigurationApplicationService.CredentialsCommand("", "key-a", ""));
    service.save(
        "22222222-2222-2222-2222-222222222222",
        "google",
        new TranslationConfigurationApplicationService.CredentialsCommand("", "key-b", ""));
    assertThat(
            service
                .credentialsFor("11111111-1111-1111-1111-111111111111", TranslationProvider.GOOGLE)
                .appKey())
        .isEqualTo("key-a");
    assertThat(
            service
                .credentialsFor("22222222-2222-2222-2222-222222222222", TranslationProvider.GOOGLE)
                .appKey())
        .isEqualTo("key-b");
  }

  private static final class InMemoryConfigurationRepository
      implements TranslationConfigurationRepository {

    private final Map<String, TranslationConfiguration> configurations = new HashMap<>();

    @Override
    public Optional<TranslationConfiguration> find(String userId, TranslationProvider provider) {
      return Optional.ofNullable(configurations.get(userId + provider.id()));
    }

    @Override
    public TranslationConfiguration save(
        String userId, TranslationProvider provider, TranslationCredentials credentials) {
      TranslationConfiguration configuration =
          new TranslationConfiguration(provider, credentials, "2026-07-23T00:00:00Z");
      configurations.put(userId + provider.id(), configuration);
      return configuration;
    }

    @Override
    public long configuredUserCount() {
      return configurations.size();
    }
  }
}
