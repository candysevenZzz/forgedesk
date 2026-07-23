package app.forgedesk.infrastructure.translation;

import app.forgedesk.domain.time.PlatformClock;
import app.forgedesk.domain.translation.TranslationConfiguration;
import app.forgedesk.domain.translation.TranslationConfigurationRepository;
import app.forgedesk.domain.translation.TranslationCredentials;
import app.forgedesk.domain.translation.TranslationException;
import app.forgedesk.domain.translation.TranslationProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FileTranslationConfigurationStore implements TranslationConfigurationRepository {

  private static final Set<String> PROVIDERS = Set.of("baidu", "youdao", "google", "alibaba");

  private final ObjectMapper objectMapper;

  private final PlatformClock clock;

  private final Path usersDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users");

  @Override
  public synchronized java.util.Optional<TranslationConfiguration> find(
      String userId, TranslationProvider provider) {
    JsonNode configuration = readConfigurations(userId).path(provider.id());
    if (!configuration.isObject()) {
      return java.util.Optional.empty();
    }
    return java.util.Optional.of(
        new TranslationConfiguration(
            provider,
            new TranslationCredentials(
                configuration.path("appId").asText(""),
                configuration.path("appKey").asText(""),
                configuration.path("appSecret").asText("")),
            configuration.path("updatedAt").asText("")));
  }

  @Override
  public synchronized TranslationConfiguration save(
      String userId, TranslationProvider provider, TranslationCredentials credentials) {
    ObjectNode configurations = readConfigurations(userId);
    ObjectNode value = configurations.putObject(provider.id());
    value.put("appId", credentials.appId());
    value.put("appKey", credentials.appKey());
    value.put("appSecret", credentials.appSecret());
    String updatedAt = clock.now();
    value.put("updatedAt", updatedAt);
    writeConfigurations(userId, configurations);
    return new TranslationConfiguration(provider, credentials, updatedAt);
  }

  @Override
  public long configuredUserCount() {
    if (!Files.exists(usersDirectory)) {
      return 0;
    }
    try (var directories = Files.list(usersDirectory)) {
      return directories
          .filter(Files::isDirectory)
          .map(this::configurationPath)
          .filter(Files::exists)
          .count();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取翻译服务配置", exception);
    }
  }

  private ObjectNode readConfigurations(String userId) {
    Path configurationPath = configurationPath(userId);
    if (!Files.exists(configurationPath)) {
      return objectMapper.createObjectNode();
    }
    try {
      JsonNode value = objectMapper.readTree(configurationPath.toFile());
      return value != null && value.isObject()
          ? (ObjectNode) value
          : objectMapper.createObjectNode();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取翻译服务配置", exception);
    }
  }

  private void writeConfigurations(String userId, ObjectNode configurations) {
    Path configurationPath = configurationPath(userId);
    try {
      Files.createDirectories(configurationPath.getParent());
      restrictDirectory(configurationPath.getParent());
      Path temporaryPath =
          configurationPath.resolveSibling(configurationPath.getFileName() + ".tmp");
      objectMapper.writeValue(temporaryPath.toFile(), configurations);
      try {
        Files.move(
            temporaryPath,
            configurationPath,
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporaryPath, configurationPath, StandardCopyOption.REPLACE_EXISTING);
      }
      restrictPermissions(configurationPath);
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存翻译服务配置", exception);
    }
  }

  private Path configurationPath(Path userDirectory) {
    return userDirectory.resolve("translation-providers.json");
  }

  private Path configurationPath(String userId) {
    if (!userId.matches("[0-9a-f-]{36}")) {
      throw new TranslationException("无效的用户身份");
    }
    return configurationPath(usersDirectory.resolve(userId));
  }

  private void restrictPermissions(Path configurationPath) {
    try {
      Files.setPosixFilePermissions(
          configurationPath,
          Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
    } catch (UnsupportedOperationException | IOException ignored) {
      // Windows and some filesystems do not expose POSIX permissions.
    }
  }

  private void restrictDirectory(Path directory) {
    try {
      Files.setPosixFilePermissions(
          directory,
          Set.of(
              PosixFilePermission.OWNER_READ,
              PosixFilePermission.OWNER_WRITE,
              PosixFilePermission.OWNER_EXECUTE));
    } catch (UnsupportedOperationException | IOException ignored) {
      // Windows and some filesystems do not expose POSIX permissions.
    }
  }
}
