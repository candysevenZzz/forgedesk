package app.forgedesk.infrastructure.worknotes;

import app.forgedesk.domain.worknotes.WorkNotesArchiveStore;
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
public class FileWorkNotesArchiveStore implements WorkNotesArchiveStore {

  private final ObjectMapper objectMapper;

  private final Path usersDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users");

  @Override
  public synchronized ObjectNode load(String userId) {
    return readArchive(userId);
  }

  @Override
  public synchronized void save(String userId, ObjectNode archive) {
    writeArchive(userId, archive);
  }

  @Override
  public long archiveCount() {
    if (!Files.exists(usersDirectory)) {
      return 0;
    }
    try (var directories = Files.list(usersDirectory)) {
      return directories
          .filter(Files::isDirectory)
          .map(this::archivePath)
          .filter(Files::exists)
          .count();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取服务端笔记归档", exception);
    }
  }

  private ObjectNode readArchive(String userId) {
    Path archivePath = archivePath(userId);
    if (!Files.exists(archivePath)) {
      return emptyArchive();
    }
    try {
      JsonNode value = objectMapper.readTree(archivePath.toFile());
      return value != null && value.isObject() ? (ObjectNode) value : emptyArchive();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取服务端笔记归档", exception);
    }
  }

  private void writeArchive(String userId, ObjectNode archive) {
    Path archivePath = archivePath(userId);
    try {
      Files.createDirectories(archivePath.getParent());
      restrictDirectory(archivePath.getParent());
      Path temporaryPath = archivePath.resolveSibling(archivePath.getFileName() + ".tmp");
      objectMapper.writeValue(temporaryPath.toFile(), archive);
      try {
        Files.move(
            temporaryPath,
            archivePath,
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporaryPath, archivePath, StandardCopyOption.REPLACE_EXISTING);
      }
      restrictPermissions(archivePath);
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存服务端笔记归档", exception);
    }
  }

  private Path archivePath(Path userDirectory) {
    return userDirectory.resolve("work-notes.json");
  }

  private Path archivePath(String userId) {
    if (!userId.matches("[0-9a-f-]{36}")) {
      throw new IllegalArgumentException("无效的用户身份");
    }
    return archivePath(usersDirectory.resolve(userId));
  }

  private void restrictPermissions(Path archivePath) {
    try {
      Files.setPosixFilePermissions(
          archivePath, Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
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

  private ObjectNode emptyArchive() {
    ObjectNode archive = objectMapper.createObjectNode();
    archive.put("version", 2);
    archive.set("days", objectMapper.createObjectNode());
    archive.set("tombstones", objectMapper.createObjectNode());
    return archive;
  }
}
