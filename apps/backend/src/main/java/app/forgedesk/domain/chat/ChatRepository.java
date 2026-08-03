package app.forgedesk.domain.chat;

import java.util.List;
import java.util.Optional;

public interface ChatRepository {

  void saveConversation(ChatConversation conversation);

  /** 删除会话元数据及其全部密文消息。调用方必须先完成权限校验。 */
  void deleteConversation(String conversationId);

  void touchConversation(String conversationId, String updatedAt);

  void updateConversationProfile(
      String conversationId, String title, String announcement, String updatedAt);

  Optional<ChatConversation> findConversation(String conversationId);

  List<ChatConversation> conversationsFor(String userId);

  void appendMessage(EncryptedChatMessage message);

  ChatMessagePage messagePage(String conversationId, String after, String before, int limit);

  List<EncryptedChatMessage> messagesAfter(String conversationId, String after);
}
