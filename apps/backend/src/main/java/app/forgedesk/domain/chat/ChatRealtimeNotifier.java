package app.forgedesk.domain.chat;

import java.util.List;
import java.util.Set;

public interface ChatRealtimeNotifier {

  void conversationChanged(List<String> userIds, String conversationId, String createdAt);

  /** 向成员通知会话已被删除，客户端应移除其列表项与当前视图。 */
  void conversationDeleted(List<String> userIds, String conversationId, String deletedAt);

  void messageCreated(
      List<String> userIds, String conversationId, String senderId, String createdAt);

  Set<String> onlineUserIds();
}
