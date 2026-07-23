package app.forgedesk.domain.auth;

import java.util.Optional;

public interface AvatarStore {

  String save(String userId, String dataUrl);

  Optional<Avatar> find(String userId);

  record Avatar(byte[] content, String contentType) {}
}
