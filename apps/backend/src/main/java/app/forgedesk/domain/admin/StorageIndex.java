package app.forgedesk.domain.admin;

import java.util.List;

public interface StorageIndex {

  List<StoredResource> list();

  record StoredResource(String kind, String userId, long sizeBytes, String updatedAt) {}
}
