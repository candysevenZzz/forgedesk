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
    ObjectNode merged = merger.merge(archiveStore.load(userId), clientArchive);
    archiveStore.save(userId, merged);
    return merged;
  }

  public long archiveCount() {
    return archiveStore.archiveCount();
  }
}
