package app.forgedesk.domain.chat;

import java.util.List;

public interface ChatDeviceKeyRepository {

  ChatDeviceKey save(ChatDeviceKey key);

  List<ChatDeviceKey> findByUserIds(List<String> userIds);
}
