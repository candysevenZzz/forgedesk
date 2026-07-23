package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.UserAccount;
import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.auth.UserSummary;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Repository;

@Repository
public class FileUserAccountRepository implements UserAccountRepository {

  private final JsonFileSupport files;

  private final Path usersPath =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "users.json");

  public FileUserAccountRepository(ObjectMapper objectMapper) {
    this.files = new JsonFileSupport(objectMapper);
  }

  @Override
  public Optional<UserAccount> findByUsername(String username) {
    return accounts().stream().filter(account -> account.username().equals(username)).findFirst();
  }

  @Override
  public Optional<UserAccount> findById(String id) {
    return accounts().stream().filter(account -> account.id().equals(id)).findFirst();
  }

  @Override
  public synchronized void save(UserAccount account) {
    ArrayNode users = files.readArray(usersPath);
    ObjectNode user = null;
    for (JsonNode value : users) {
      if (value.isObject() && account.id().equals(value.path("id").asText())) {
        user = (ObjectNode) value;
        break;
      }
    }
    if (user == null) {
      user = users.addObject();
    }
    user.put("id", account.id());
    user.put("username", account.username());
    user.put("displayName", account.displayName());
    user.put("role", account.role());
    user.put("passwordHash", account.passwordHash());
    user.put("salt", account.salt());
    user.put("createdAt", account.createdAt());
    user.put("avatarVersion", account.avatarVersion());
    files.writeArray(usersPath, users);
  }

  @Override
  public List<UserSummary> listSummaries() {
    return accounts().stream().map(UserAccount::summary).toList();
  }

  @Override
  public long count() {
    return accounts().size();
  }

  private List<UserAccount> accounts() {
    return StreamSupport.stream(files.readArray(usersPath).spliterator(), false)
        .filter(JsonNode::isObject)
        .map(this::account)
        .toList();
  }

  private UserAccount account(JsonNode value) {
    return new UserAccount(
        value.path("id").asText(),
        value.path("username").asText(),
        value.path("displayName").asText(),
        value.path("role").asText(),
        value.path("passwordHash").asText(),
        value.path("salt").asText(),
        value.path("createdAt").asText(),
        value.path("avatarVersion").asText(""));
  }
}
