package app.forgedesk.domain.worknotes;

import com.fasterxml.jackson.databind.node.ObjectNode;

public interface WorkNotesArchiveStore {

  ObjectNode load(String userId);

  void save(String userId, ObjectNode archive);

  long archiveCount();
}
