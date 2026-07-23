package app.forgedesk.infrastructure.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;

final class JsonFileSupport {

  private final ObjectMapper objectMapper;

  JsonFileSupport(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  synchronized ArrayNode readArray(Path path) {
    if (!Files.exists(path)) {
      return objectMapper.createArrayNode();
    }
    try {
      JsonNode value = objectMapper.readTree(path.toFile());
      return value != null && value.isArray() ? (ArrayNode) value : objectMapper.createArrayNode();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取身份数据", exception);
    }
  }

  synchronized void writeArray(Path path, ArrayNode values) {
    try {
      Files.createDirectories(path.getParent());
      Path temporaryPath = path.resolveSibling(path.getFileName() + ".tmp");
      objectMapper.writeValue(temporaryPath.toFile(), values);
      try {
        Files.move(
            temporaryPath,
            path,
            StandardCopyOption.ATOMIC_MOVE,
            StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporaryPath, path, StandardCopyOption.REPLACE_EXISTING);
      }
      try {
        Files.setPosixFilePermissions(
            path, Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
      } catch (UnsupportedOperationException | IOException ignored) {
        // Some filesystems do not expose POSIX permissions.
      }
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存身份数据", exception);
    }
  }
}
