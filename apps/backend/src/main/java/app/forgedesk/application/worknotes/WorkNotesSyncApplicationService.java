package app.forgedesk.application.worknotes;

import app.forgedesk.domain.worknotes.WorkNotesArchiveMerger;
import app.forgedesk.domain.worknotes.WorkNotesArchiveStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkNotesSyncApplicationService {

  private final WorkNotesArchiveStore archiveStore;

  private final WorkNotesArchiveMerger merger;

  public synchronized ObjectNode sync(String userId, JsonNode clientArchive) {
    java.util.Optional<ObjectNode> storedArchive = archiveStore.find(userId);
    ObjectNode merged = merger.merge(storedArchive.orElse(null), clientArchive);
    if (storedArchive.isPresent() || hasEntries(merged)) {
      archiveStore.save(userId, merged);
    }
    return merged;
  }

  public long archiveCount() {
    return archiveStore.archiveCount();
  }

  private boolean hasEntries(ObjectNode archive) {
    return archive.path("days").size() > 0 || archive.path("tombstones").size() > 0;
  }
}
