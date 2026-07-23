package app.forgedesk.application.translation;

import app.forgedesk.domain.translation.TranslationConfiguration;
import app.forgedesk.domain.translation.TranslationConfigurationRepository;
import app.forgedesk.domain.translation.TranslationCredentials;
import app.forgedesk.domain.translation.TranslationException;
import app.forgedesk.domain.translation.TranslationProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TranslationConfigurationApplicationService {

  private final TranslationConfigurationRepository repository;

  public ConfigurationStatus status(String userId, String providerId) {
    TranslationProvider provider = TranslationProvider.from(providerId);
    return repository
        .find(userId, provider)
        .filter(configuration -> isComplete(provider, configuration.credentials()))
        .map(
            configuration ->
                new ConfigurationStatus(provider.id(), true, configuration.updatedAt()))
        .orElseGet(() -> new ConfigurationStatus(provider.id(), false, ""));
  }

  public ConfigurationStatus save(String userId, String providerId, CredentialsCommand command) {
    if (command == null) {
      throw new TranslationException("配置内容不能为空");
    }
    TranslationProvider provider = TranslationProvider.from(providerId);
    TranslationCredentials credentials =
        new TranslationCredentials(
            trim(command.appId()), trim(command.appKey()), trim(command.appSecret()));
    requireComplete(provider, credentials);
    TranslationConfiguration configuration = repository.save(userId, provider, credentials);
    return new ConfigurationStatus(provider.id(), true, configuration.updatedAt());
  }

  public TranslationCredentials credentialsFor(String userId, TranslationProvider provider) {
    TranslationCredentials credentials =
        repository
            .find(userId, provider)
            .map(TranslationConfiguration::credentials)
            .orElseThrow(() -> new TranslationException("请先完成配置：" + requiredField(provider)));
    requireComplete(provider, credentials);
    return credentials;
  }

  public long configuredUserCount() {
    return repository.configuredUserCount();
  }

  private boolean isComplete(TranslationProvider provider, TranslationCredentials credentials) {
    try {
      requireComplete(provider, credentials);
      return true;
    } catch (TranslationException exception) {
      return false;
    }
  }

  private void requireComplete(TranslationProvider provider, TranslationCredentials credentials) {
    switch (provider) {
      case BAIDU -> {
        require(credentials.appId(), "百度 App ID");
        require(credentials.appKey(), "百度 App Key");
      }
      case YOUDAO -> {
        require(credentials.appKey(), "有道 App Key");
        require(credentials.appSecret(), "有道 App Secret");
      }
      case GOOGLE -> require(credentials.appKey(), "Google Cloud API Key");
      case ALIBABA -> {
        require(credentials.appId(), "阿里云 AccessKey ID");
        require(credentials.appKey(), "阿里云 AccessKey Secret");
      }
    }
  }

  private String requiredField(TranslationProvider provider) {
    return switch (provider) {
      case BAIDU -> "百度 App ID 和 App Key";
      case YOUDAO -> "有道 App Key 和 App Secret";
      case GOOGLE -> "Google Cloud API Key";
      case ALIBABA -> "阿里云 AccessKey ID 和 AccessKey Secret";
    };
  }

  private void require(String value, String label) {
    if (value == null || value.isBlank()) {
      throw new TranslationException("请先完成配置：" + label);
    }
  }

  private String trim(String value) {
    return value == null ? "" : value.trim();
  }

  public record CredentialsCommand(String appId, String appKey, String appSecret) {}

  public record ConfigurationStatus(String provider, boolean configured, String updatedAt) {}
}
