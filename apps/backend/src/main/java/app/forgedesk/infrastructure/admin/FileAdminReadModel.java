package app.forgedesk.infrastructure.admin;

import app.forgedesk.domain.admin.StorageIndex;
import app.forgedesk.domain.time.PlatformClock;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FileAdminReadModel implements StorageIndex {

  private final Path usersDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users");

  private final PlatformClock clock;

  @Override
  public List<StoredResource> list() {
    if (!Files.exists(usersDirectory)) {
      return List.of();
    }
    try (var paths = Files.walk(usersDirectory, 2)) {
      return paths
          .filter(Files::isRegularFile)
          .map(path -> toStorageRecord(usersDirectory, path))
          .sorted(Comparator.comparing(this::updatedAt).reversed())
          .toList();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取服务端存储索引", exception);
    }
  }

  private StoredResource toStorageRecord(Path usersDirectory, Path path) {
    try {
      Path relative = usersDirectory.relativize(path);
      String fileName = path.getFileName().toString();
      String kind =
          fileName.equals("work-notes.json")
              ? "工作笔记归档"
              : fileName.equals("translation-providers.json") ? "翻译配置" : "系统记录";
      String userId = relative.getNameCount() > 1 ? relative.getName(0).toString() : "";
      return new StoredResource(
          kind,
          userId,
          Files.size(path),
          clock.format(Files.getLastModifiedTime(path).toInstant()));
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取服务端存储索引", exception);
    }
  }

  private java.time.Instant updatedAt(StoredResource resource) {
    try {
      return java.time.Instant.parse(resource.updatedAt());
    } catch (Exception ignored) {
      return java.time.Instant.EPOCH;
    }
  }
}
