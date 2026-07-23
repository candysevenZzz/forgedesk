package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.UserSession;
import app.forgedesk.domain.auth.UserSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Repository;

@Repository
public class FileUserSessionRepository implements UserSessionRepository {

  private final JsonFileSupport files;

  private final ObjectMapper objectMapper;

  private final Path sessionsPath =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "sessions.json");

  public FileUserSessionRepository(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
    this.files = new JsonFileSupport(objectMapper);
  }

  @Override
  public List<UserSession> findAll() {
    return StreamSupport.stream(files.readArray(sessionsPath).spliterator(), false)
        .filter(JsonNode::isObject)
        .map(this::session)
        .toList();
  }

  @Override
  public synchronized void replaceAll(List<UserSession> sessions) {
    ArrayNode values = objectMapper.createArrayNode();
    for (UserSession session : sessions) {
      ObjectNode value = values.addObject();
      value.put("tokenHash", session.tokenHash());
      value.put("userId", session.userId());
      value.put("createdAt", session.createdAt());
      value.put("expiresAt", session.expiresAt());
    }
    files.writeArray(sessionsPath, values);
  }

  private UserSession session(JsonNode value) {
    return new UserSession(
        value.path("tokenHash").asText(),
        value.path("userId").asText(),
        value.path("createdAt").asText(),
        value.path("expiresAt").asText());
  }
}
