package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.AvatarStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

@Repository
public class FileAvatarStore implements AvatarStore {

  private final Path usersDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users");

  @Override
  public String save(String userId, String dataUrl) {
    if (dataUrl == null || !dataUrl.matches("data:image/(png|jpeg|webp);base64,.+")) {
      throw new IllegalArgumentException("头像仅支持 PNG、JPEG 或 WebP 图片");
    }
    if (dataUrl.length() > 3 * 1024 * 1024) {
      throw new IllegalArgumentException("头像不能超过 2 MB");
    }
    String[] parts = dataUrl.split(",", 2);
    byte[] content;
    try {
      content = Base64.getDecoder().decode(parts[1]);
    } catch (IllegalArgumentException exception) {
      throw new IllegalArgumentException("头像图片数据无效");
    }
    if (content.length == 0 || content.length > 2 * 1024 * 1024) {
      throw new IllegalArgumentException("头像不能超过 2 MB");
    }
    String extension =
        parts[0].contains("jpeg") ? "jpg" : parts[0].contains("webp") ? "webp" : "png";
    try {
      Path directory = profileDirectory(userId);
      Files.createDirectories(directory);
      Files.write(directory.resolve("avatar." + extension), content);
      for (String stale : new String[] {"avatar.png", "avatar.jpg", "avatar.webp"}) {
        if (!stale.endsWith(extension)) {
          Files.deleteIfExists(directory.resolve(stale));
        }
      }
      return String.valueOf(System.currentTimeMillis());
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存头像", exception);
    }
  }

  @Override
  public Optional<Avatar> find(String userId) {
    Path directory = profileDirectory(userId);
    for (String extension : new String[] {"png", "jpg", "webp"}) {
      Path path = directory.resolve("avatar." + extension);
      if (Files.exists(path)) {
        try {
          return Optional.of(
              new Avatar(
                  Files.readAllBytes(path),
                  extension.equals("jpg") ? "image/jpeg" : "image/" + extension));
        } catch (IOException exception) {
          throw new IllegalStateException("无法读取头像", exception);
        }
      }
    }
    return Optional.empty();
  }

  private Path profileDirectory(String userId) {
    try {
      return usersDirectory.resolve(UUID.fromString(userId).toString()).resolve("profile");
    } catch (IllegalArgumentException exception) {
      throw new IllegalArgumentException("用户标识无效");
    }
  }
}
