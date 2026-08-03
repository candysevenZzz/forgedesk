package app.forgedesk.domain.worknotes;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;

public interface WorkNotesArchiveStore {

  ObjectNode load(String userId);

  default Optional<ObjectNode> find(String userId) {
    return Optional.of(load(userId));
  }

  void save(String userId, ObjectNode archive);

  long archiveCount();
}
