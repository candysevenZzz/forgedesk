package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatMessagePage;
import app.forgedesk.domain.chat.ChatRepository;
import app.forgedesk.domain.chat.EncryptedChatMessage;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcChatRepository implements ChatRepository {

  private final JdbcTemplate jdbc;

  @Override
  public void saveConversation(ChatConversation conversation) {
    jdbc.update(
        "INSERT INTO chat_conversations (id, title, announcement, created_by, created_at, updated_at) "
            + "VALUES (?, ?, ?, ?, ?, ?)",
        conversation.id(),
        conversation.title(),
        conversation.announcement(),
        conversation.createdBy(),
        conversation.createdAt(),
        conversation.updatedAt());
    for (int index = 0; index < conversation.participantIds().size(); index++) {
      jdbc.update(
          "INSERT INTO chat_conversation_members (conversation_id, user_id, member_order) "
              + "VALUES (?, ?, ?)",
          conversation.id(),
          conversation.participantIds().get(index),
          index);
    }
  }

  @Override
  public void deleteConversation(String conversationId) {
    jdbc.update("DELETE FROM chat_conversations WHERE id = ?", conversationId);
  }

  @Override
  public void touchConversation(String conversationId, String updatedAt) {
    jdbc.update(
        "UPDATE chat_conversations SET updated_at = ? WHERE id = ?", updatedAt, conversationId);
  }

  @Override
  public void updateConversationProfile(
      String conversationId, String title, String announcement, String updatedAt) {
    jdbc.update(
        "UPDATE chat_conversations SET title = ?, announcement = ?, updated_at = ? WHERE id = ?",
        title,
        announcement,
        updatedAt,
        conversationId);
  }

  @Override
  public Optional<ChatConversation> findConversation(String conversationId) {
    return conversations("WHERE c.id = ?", conversationId).stream().findFirst();
  }

  @Override
  public List<ChatConversation> conversationsFor(String userId) {
    return conversations(
        "JOIN chat_conversation_members own ON own.conversation_id = c.id "
            + "WHERE own.user_id = ? ORDER BY c.updated_at DESC, c.id ASC, members.member_order ASC",
        userId);
  }

  @Override
  public void appendMessage(EncryptedChatMessage message) {
    jdbc.update(
        "INSERT INTO chat_messages "
            + "(id, conversation_id, sender_id, ciphertext, nonce, key_version, key_envelopes, created_at) "
            + "VALUES (?, ?, ?, ?, ?, ?, CAST('{}' AS JSON), ?)",
        message.id(),
        message.conversationId(),
        message.senderId(),
        message.ciphertext(),
        message.nonce(),
        message.keyVersion(),
        message.createdAt());
  }

  @Override
  public ChatMessagePage messagePage(
      String conversationId, String after, String before, int limit) {
    int pageSize = Math.max(1, Math.min(limit, 200));
    if (!after.isBlank()) {
      List<EncryptedChatMessage> newer =
          messages(
              "WHERE conversation_id = ? AND key_version = 2 AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT ?",
              conversationId,
              after,
              pageSize + 1);
      boolean hasNewer = newer.size() > pageSize;
      List<EncryptedChatMessage> page = hasNewer ? newer.subList(0, pageSize) : newer;
      return new ChatMessagePage(
          List.copyOf(page),
          page.isEmpty() ? after : page.getLast().createdAt(),
          "",
          hasNewer,
          false);
    }
    if (!before.isBlank()) {
      List<EncryptedChatMessage> older =
          messages(
              "WHERE conversation_id = ? AND key_version = 2 AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT ?",
              conversationId,
              before,
              pageSize + 1);
      boolean hasOlder = older.size() > pageSize;
      List<EncryptedChatMessage> page =
          new ArrayList<>(hasOlder ? older.subList(0, pageSize) : older);
      Collections.reverse(page);
      return new ChatMessagePage(
          List.copyOf(page),
          "",
          page.isEmpty() ? before : page.getFirst().createdAt(),
          false,
          hasOlder);
    }
    List<EncryptedChatMessage> latest =
        messages(
            "WHERE conversation_id = ? AND key_version = 2 ORDER BY created_at DESC, id DESC LIMIT ?",
            conversationId,
            pageSize + 1);
    boolean hasOlder = latest.size() > pageSize;
    List<EncryptedChatMessage> page =
        new ArrayList<>(hasOlder ? latest.subList(0, pageSize) : latest);
    Collections.reverse(page);
    return new ChatMessagePage(
        List.copyOf(page),
        page.isEmpty() ? "" : page.getLast().createdAt(),
        page.isEmpty() ? "" : page.getFirst().createdAt(),
        false,
        hasOlder);
  }

  @Override
  public List<EncryptedChatMessage> messagesAfter(String conversationId, String after) {
    return after == null || after.isBlank()
        ? messages(
            "WHERE conversation_id = ? AND key_version = 2 ORDER BY created_at ASC, id ASC",
            conversationId)
        : messages(
            "WHERE conversation_id = ? AND key_version = 2 AND created_at > ? ORDER BY created_at ASC, id ASC",
            conversationId,
            after);
  }

  private List<ChatConversation> conversations(String condition, Object... parameters) {
    Map<String, ConversationBuilder> conversations = new LinkedHashMap<>();
    jdbc.query(
        "SELECT c.id, c.title, c.announcement, c.created_by, c.created_at, c.updated_at, "
            + "members.user_id AS member_id "
            + "FROM chat_conversations c "
            + "JOIN chat_conversation_members members ON members.conversation_id = c.id "
            + condition,
        resultSet -> {
          String id = resultSet.getString("id");
          String title = resultSet.getString("title");
          String announcement = resultSet.getString("announcement");
          String createdBy = resultSet.getString("created_by");
          String createdAt = resultSet.getString("created_at");
          String updatedAt = resultSet.getString("updated_at");
          ConversationBuilder builder =
              conversations.computeIfAbsent(
                  id,
                  ignored ->
                      new ConversationBuilder(
                          id, title, announcement, createdBy, createdAt, updatedAt));
          builder.members.add(resultSet.getString("member_id"));
        },
        parameters);
    return conversations.values().stream().map(ConversationBuilder::build).toList();
  }

  private List<EncryptedChatMessage> messages(String condition, Object... parameters) {
    return jdbc.query(
        "SELECT id, conversation_id, sender_id, ciphertext, nonce, key_version, created_at FROM chat_messages "
            + condition,
        (resultSet, rowNum) -> message(resultSet),
        parameters);
  }

  private EncryptedChatMessage message(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    return new EncryptedChatMessage(
        resultSet.getString("id"),
        resultSet.getString("conversation_id"),
        resultSet.getString("sender_id"),
        resultSet.getString("ciphertext"),
        resultSet.getString("nonce"),
        resultSet.getInt("key_version"),
        resultSet.getString("created_at"));
  }

  private static final class ConversationBuilder {
    private final String id;
    private final String title;
    private final String announcement;
    private final String createdBy;
    private final String createdAt;
    private final String updatedAt;
    private final List<String> members = new ArrayList<>();

    private ConversationBuilder(
        String id,
        String title,
        String announcement,
        String createdBy,
        String createdAt,
        String updatedAt) {
      this.id = id;
      this.title = title;
      this.announcement = announcement;
      this.createdBy = createdBy;
      this.createdAt = createdAt;
      this.updatedAt = updatedAt;
    }

    private ChatConversation build() {
      return new ChatConversation(
          id, title, announcement, List.copyOf(members), createdBy, createdAt, updatedAt);
    }
  }
}
