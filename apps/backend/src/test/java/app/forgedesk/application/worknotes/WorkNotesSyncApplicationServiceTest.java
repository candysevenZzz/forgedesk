package app.forgedesk.application.worknotes;

import static org.assertj.core.api.Assertions.assertThat;

import app.forgedesk.domain.worknotes.WorkNotesArchiveMerger;
import app.forgedesk.domain.worknotes.WorkNotesArchiveStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class WorkNotesSyncApplicationServiceTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void syncsOnlyTheAuthenticatedUsersArchive() {
    InMemoryArchiveStore store = new InMemoryArchiveStore();
    WorkNotesSyncApplicationService service =
        new WorkNotesSyncApplicationService(store, new WorkNotesArchiveMerger(objectMapper));
    service.sync("11111111-1111-1111-1111-111111111111", archive("one", "A 的笔记"));
    service.sync("22222222-2222-2222-2222-222222222222", archive("two", "B 的笔记"));
    assertThat(store.archives.get("11111111-1111-1111-1111-111111111111").toString())
        .contains("A 的笔记")
        .doesNotContain("B 的笔记");
    assertThat(store.archives.get("22222222-2222-2222-2222-222222222222").toString())
        .contains("B 的笔记")
        .doesNotContain("A 的笔记");
  }

  private ObjectNode archive(String id, String content) {
    ObjectNode archive = objectMapper.createObjectNode();
    ObjectNode days = archive.putObject("days");
    ObjectNode note = days.putArray("2026-07-23").addObject();
    note.put("id", id);
    note.put("updatedAt", "2026-07-23T01:00:00Z");
    note.put("content", content);
    archive.putObject("tombstones");
    return archive;
  }

  private static final class InMemoryArchiveStore implements WorkNotesArchiveStore {

    private final Map<String, ObjectNode> archives = new HashMap<>();

    @Override
    public ObjectNode load(String userId) {
      return archives.getOrDefault(userId, new ObjectMapper().createObjectNode());
    }

    @Override
    public void save(String userId, ObjectNode archive) {
      archives.put(userId, archive.deepCopy());
    }

    @Override
    public long archiveCount() {
      return archives.size();
    }
  }
}
