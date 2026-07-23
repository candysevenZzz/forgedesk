package app.forgedesk.domain.auth;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository {

  Optional<UserAccount> findByUsername(String username);

  Optional<UserAccount> findById(String id);

  void save(UserAccount account);

  List<UserSummary> listSummaries();

  long count();
}
