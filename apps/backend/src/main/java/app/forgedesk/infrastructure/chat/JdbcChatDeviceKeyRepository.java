package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatDeviceKey;
import app.forgedesk.domain.chat.ChatDeviceKeyRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcChatDeviceKeyRepository implements ChatDeviceKeyRepository {

  private final JdbcTemplate jdbc;

  @Override
  public ChatDeviceKey save(ChatDeviceKey key) {
    jdbc.update(
        "INSERT INTO chat_device_keys (device_id, user_id, public_key_jwk, updated_at) "
            + "VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), "
            + "public_key_jwk = VALUES(public_key_jwk), updated_at = VALUES(updated_at)",
        key.deviceId(),
        key.userId(),
        key.publicKeyJwk(),
        key.updatedAt());
    return key;
  }

  @Override
  public List<ChatDeviceKey> findByUserIds(List<String> userIds) {
    if (userIds == null || userIds.isEmpty()) {
      return List.of();
    }
    String placeholders = String.join(",", java.util.Collections.nCopies(userIds.size(), "?"));
    return jdbc.query(
        "SELECT device_id, user_id, public_key_jwk, updated_at FROM chat_device_keys "
            + "WHERE user_id IN ("
            + placeholders
            + ") ORDER BY user_id, updated_at ASC",
        (resultSet, rowNum) ->
            new ChatDeviceKey(
                resultSet.getString("device_id"),
                resultSet.getString("user_id"),
                resultSet.getString("public_key_jwk"),
                resultSet.getString("updated_at")),
        userIds.toArray());
  }
}
