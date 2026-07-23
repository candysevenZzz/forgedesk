package app.forgedesk.domain.chat;

import java.util.List;
import java.util.Set;

public interface ChatRealtimeNotifier {

  void conversationChanged(List<String> userIds, String conversationId, String createdAt);

  /** 向成员通知会话已被删除，客户端应移除其列表项与当前视图。 */
  void conversationDeleted(List<String> userIds, String conversationId, String deletedAt);

  void messageCreated(
      List<String> userIds, String conversationId, String senderId, String createdAt);

  /**
   * 通知受影响会话的成员某个用户新增或更换了设备公钥。
   *
   * <p>不要广播给所有在线用户；设备公钥只会影响与该用户共享会话的成员。
   */
  void deviceChanged(List<String> recipientUserIds, String changedUserId);

  Set<String> onlineUserIds();
}
