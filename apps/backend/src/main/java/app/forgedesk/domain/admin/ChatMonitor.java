package app.forgedesk.domain.admin;

import java.util.List;

/** Read-only chat metadata used by administrators. Message bodies are never exposed here. */
public interface ChatMonitor {

  ChatOverview overview();

  List<ConversationRecord> conversations(int limit);

  List<MessageRecord> recentMessages(int limit);

  record ChatOverview(
      long conversationCount,
      long groupCount,
      long directConversationCount,
      long messageCount,
      long todayMessageCount) {}

  record ConversationRecord(
      String id,
      String title,
      int memberCount,
      String createdBy,
      String createdAt,
      String updatedAt,
      long messageCount,
      long ciphertextBytes,
      String lastMessageAt) {}

  record MessageRecord(
      String id, String conversationId, String senderId, long ciphertextBytes, String createdAt) {}
}
