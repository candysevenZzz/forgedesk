package app.forgedesk.domain.auth;

import java.util.List;

public interface UserSessionRepository {

  List<UserSession> findAll();

  void replaceAll(List<UserSession> sessions);
}
