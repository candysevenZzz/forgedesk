package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.AvatarStore;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcAvatarStore implements AvatarStore {

  // Browsers upload avatars after client-side compression. This protects the API from direct
  // oversized requests.
  private static final int MAX_AVATAR_BYTES = 256 * 1024;

  private final JdbcTemplate jdbc;

  @Override
  public String save(String userId, String dataUrl) {
    if (dataUrl == null || !dataUrl.matches("data:image/(png|jpeg|webp);base64,.+")) {
      throw new IllegalArgumentException("头像仅支持 PNG、JPEG 或 WebP 图片");
    }
    byte[] content;
    try {
      content = Base64.getDecoder().decode(dataUrl.split(",", 2)[1]);
    } catch (IllegalArgumentException exception) {
      throw new IllegalArgumentException("头像图片数据无效");
    }
    if (content.length == 0 || content.length > MAX_AVATAR_BYTES) {
      throw new IllegalArgumentException("头像不能超过 256 KB，请使用客户端压缩后重新上传");
    }
    String contentType =
        dataUrl.startsWith("data:image/jpeg")
            ? "image/jpeg"
            : dataUrl.substring(5, dataUrl.indexOf(';'));
    String version = UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO user_avatars (user_id, content, content_type, updated_at) VALUES (?, ?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type), "
            + "updated_at = VALUES(updated_at)",
        userId,
        content,
        contentType,
        Instant.now().toString());
    return version;
  }

  @Override
  public Optional<Avatar> find(String userId) {
    return jdbc
        .query(
            "SELECT content, content_type FROM user_avatars WHERE user_id = ?",
            (resultSet, rowNum) ->
                new Avatar(resultSet.getBytes("content"), resultSet.getString("content_type")),
            userId)
        .stream()
        .findFirst();
  }
}
