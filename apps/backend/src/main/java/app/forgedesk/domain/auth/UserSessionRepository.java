package app.forgedesk.domain.auth;

import java.util.Optional;

public interface UserSessionRepository {

  void save(UserSession session);

  Optional<UserSession> findByTokenHash(String tokenHash);

  void remove(String tokenHash);

  int activeCount();
}
