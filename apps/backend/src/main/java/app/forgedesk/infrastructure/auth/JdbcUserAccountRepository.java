package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.UserAccount;
import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.auth.UserSummary;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcUserAccountRepository implements UserAccountRepository {

  private static final RowMapper<UserAccount> ACCOUNT_MAPPER =
      (resultSet, rowNum) ->
          new UserAccount(
              resultSet.getString("id"),
              resultSet.getString("username"),
              resultSet.getString("display_name"),
              resultSet.getString("role"),
              resultSet.getString("password_hash"),
              resultSet.getString("salt"),
              resultSet.getString("created_at"),
              resultSet.getString("avatar_version"));

  private final JdbcTemplate jdbc;

  @Override
  public Optional<UserAccount> findByUsername(String username) {
    return jdbc
        .query(
            "SELECT id, username, display_name, role, password_hash, salt, created_at, avatar_version "
                + "FROM user_accounts WHERE username = ?",
            ACCOUNT_MAPPER,
            username)
        .stream()
        .findFirst();
  }

  @Override
  public Optional<UserAccount> findById(String id) {
    return jdbc
        .query(
            "SELECT id, username, display_name, role, password_hash, salt, created_at, avatar_version "
                + "FROM user_accounts WHERE id = ?",
            ACCOUNT_MAPPER,
            id)
        .stream()
        .findFirst();
  }

  @Override
  public void save(UserAccount account) {
    jdbc.update(
        "INSERT INTO user_accounts "
            + "(id, username, display_name, role, password_hash, salt, created_at, avatar_version) "
            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            + "ON DUPLICATE KEY UPDATE username = VALUES(username), display_name = VALUES(display_name), "
            + "role = VALUES(role), password_hash = VALUES(password_hash), salt = VALUES(salt), "
            + "avatar_version = VALUES(avatar_version)",
        account.id(),
        account.username(),
        account.displayName(),
        account.role(),
        account.passwordHash(),
        account.salt(),
        account.createdAt(),
        account.avatarVersion());
  }

  @Override
  public List<UserSummary> listSummaries() {
    return jdbc.query(
        "SELECT id, username, display_name, role, created_at, avatar_version FROM user_accounts ORDER BY created_at ASC",
        (resultSet, rowNum) ->
            new UserSummary(
                resultSet.getString("id"),
                resultSet.getString("username"),
                resultSet.getString("display_name"),
                resultSet.getString("role"),
                resultSet.getString("created_at"),
                resultSet.getString("avatar_version")));
  }

  @Override
  public long count() {
    Long count = jdbc.queryForObject("SELECT COUNT(*) FROM user_accounts", Long.class);
    return count == null ? 0 : count;
  }
}
