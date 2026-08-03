package app.forgedesk.infrastructure.worknotes;

import app.forgedesk.domain.time.PlatformClock;
import app.forgedesk.domain.worknotes.WorkNotesArchiveStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcWorkNotesArchiveStore implements WorkNotesArchiveStore {

  private final JdbcTemplate jdbc;

  private final ObjectMapper objectMapper;

  private final PlatformClock clock;

  @Override
  public ObjectNode load(String userId) {
    return find(userId).orElseGet(this::emptyArchive);
  }

  @Override
  public Optional<ObjectNode> find(String userId) {
    return jdbc
        .query(
            "SELECT CAST(archive AS CHAR) FROM work_note_archives WHERE user_id = ?",
            (resultSet, rowNum) -> resultSet.getString(1),
            userId)
        .stream()
        .findFirst()
        .map(this::parse);
  }

  @Override
  public void save(String userId, ObjectNode archive) {
    jdbc.update(
        "INSERT INTO work_note_archives (user_id, archive, updated_at) VALUES (?, CAST(? AS JSON), ?) "
            + "ON DUPLICATE KEY UPDATE archive = VALUES(archive), updated_at = VALUES(updated_at)",
        userId,
        serialize(archive),
        clock.now());
  }

  @Override
  public long archiveCount() {
    Long count = jdbc.queryForObject("SELECT COUNT(*) FROM work_note_archives", Long.class);
    return count == null ? 0 : count;
  }

  private ObjectNode parse(String value) {
    try {
      JsonNode archive = objectMapper.readTree(value);
      return archive != null && archive.isObject() ? (ObjectNode) archive : emptyArchive();
    } catch (Exception exception) {
      throw new IllegalStateException("无法读取服务端笔记归档", exception);
    }
  }

  private String serialize(ObjectNode archive) {
    try {
      return objectMapper.writeValueAsString(archive);
    } catch (Exception exception) {
      throw new IllegalStateException("无法保存服务端笔记归档", exception);
    }
  }

  private ObjectNode emptyArchive() {
    ObjectNode archive = objectMapper.createObjectNode();
    archive.put("version", 2);
    archive.set("days", objectMapper.createObjectNode());
    archive.set("tombstones", objectMapper.createObjectNode());
    return archive;
  }
}
