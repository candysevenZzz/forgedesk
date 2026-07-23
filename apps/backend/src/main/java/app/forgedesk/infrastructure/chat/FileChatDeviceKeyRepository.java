package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatDeviceKey;
import app.forgedesk.domain.chat.ChatDeviceKeyRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.List;
import java.util.Set;
import java.util.stream.StreamSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class FileChatDeviceKeyRepository implements ChatDeviceKeyRepository {

  private final ObjectMapper objectMapper;

  private final Path usersDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users");

  @Override
  public synchronized ChatDeviceKey save(ChatDeviceKey key) {
    ArrayNode values = readArray(path(key.userId()));
    ObjectNode value = null;
    for (JsonNode item : values) {
      if (item.isObject() && key.deviceId().equals(item.path("deviceId").asText())) {
        value = (ObjectNode) item;
        break;
      }
    }
    if (value == null) {
      value = values.addObject();
    }
    value.put("deviceId", key.deviceId());
    value.put("publicKeyJwk", key.publicKeyJwk());
    value.put("updatedAt", key.updatedAt());
    writeArray(path(key.userId()), values);
    return key;
  }

  @Override
  public List<ChatDeviceKey> findByUserIds(List<String> userIds) {
    return userIds.stream()
        .flatMap(userId -> values(readArray(path(userId))).map(value -> key(userId, value)))
        .toList();
  }

  private ChatDeviceKey key(String userId, JsonNode value) {
    return new ChatDeviceKey(
        value.path("deviceId").asText(),
        userId,
        value.path("publicKeyJwk").asText(),
        value.path("updatedAt").asText());
  }

  private Path path(String userId) {
    if (userId == null || !userId.matches("[0-9a-f-]{36}")) {
      throw new IllegalArgumentException("用户标识无效");
    }
    return usersDirectory.resolve(userId).resolve("chat-devices.json");
  }

  private ArrayNode readArray(Path path) {
    if (!Files.exists(path)) {
      return objectMapper.createArrayNode();
    }
    try {
      JsonNode value = objectMapper.readTree(path.toFile());
      return value != null && value.isArray() ? (ArrayNode) value : objectMapper.createArrayNode();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取聊天设备", exception);
    }
  }

  private void writeArray(Path path, ArrayNode values) {
    try {
      Files.createDirectories(path.getParent());
      setOwnerOnlyDirectoryPermissions(path.getParent());
      Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
      objectMapper.writeValue(temporary.toFile(), values);
      setOwnerOnlyFilePermissions(temporary);
      try {
        Files.move(
            temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
      }
      setOwnerOnlyFilePermissions(path);
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存聊天设备", exception);
    }
  }

  private void setOwnerOnlyDirectoryPermissions(Path path) {
    try {
      Files.setPosixFilePermissions(
          path,
          Set.of(
              PosixFilePermission.OWNER_READ,
              PosixFilePermission.OWNER_WRITE,
              PosixFilePermission.OWNER_EXECUTE));
    } catch (UnsupportedOperationException | IOException ignored) {
      // Windows and some mounted volumes do not provide POSIX file permissions.
    }
  }

  private void setOwnerOnlyFilePermissions(Path path) {
    try {
      Files.setPosixFilePermissions(
          path, Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
    } catch (UnsupportedOperationException | IOException ignored) {
      // Windows and some mounted volumes do not provide POSIX file permissions.
    }
  }

  private java.util.stream.Stream<JsonNode> values(ArrayNode values) {
    return StreamSupport.stream(values.spliterator(), false).filter(JsonNode::isObject);
  }
}
