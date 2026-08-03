package app.forgedesk.infrastructure.admin;

import app.forgedesk.domain.admin.ChatMonitor;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcChatMonitor implements ChatMonitor {

  private final JdbcTemplate jdbc;

  @Override
  public ChatOverview overview() {
    Long conversationCount =
        jdbc.queryForObject("SELECT COUNT(*) FROM chat_conversations", Long.class);
    Long groupCount =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM (SELECT conversation_id FROM chat_conversation_members "
                + "GROUP BY conversation_id HAVING COUNT(*) > 2) groups",
            Long.class);
    Long messageCount =
        jdbc.queryForObject("SELECT COUNT(*) FROM chat_messages WHERE key_version = 2", Long.class);
    Long todayMessageCount =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM chat_messages WHERE key_version = 2 AND created_at >= ?",
            Long.class,
            java.time.OffsetDateTime.now(java.time.ZoneOffset.ofHours(8))
                .toLocalDate()
                .atStartOfDay()
                .atOffset(java.time.ZoneOffset.ofHours(8))
                .toString());
    long total = conversationCount == null ? 0 : conversationCount;
    long groups = groupCount == null ? 0 : groupCount;
    return new ChatOverview(
        total,
        groups,
        Math.max(0, total - groups),
        messageCount == null ? 0 : messageCount,
        todayMessageCount == null ? 0 : todayMessageCount);
  }

  @Override
  public List<ConversationRecord> conversations(int limit) {
    return jdbc.query(
        "SELECT c.id, c.title, c.created_by, c.created_at, c.updated_at, members.member_count, "
            + "COALESCE(messages.message_count, 0) AS message_count, COALESCE(messages.ciphertext_bytes, 0) AS ciphertext_bytes, "
            + "COALESCE(messages.last_message_at, '') AS last_message_at "
            + "FROM chat_conversations c "
            + "JOIN (SELECT conversation_id, COUNT(*) AS member_count FROM chat_conversation_members GROUP BY conversation_id) members "
            + "ON members.conversation_id = c.id "
            + "LEFT JOIN (SELECT conversation_id, COUNT(*) AS message_count, "
            + "SUM(OCTET_LENGTH(ciphertext) + OCTET_LENGTH(nonce)) AS ciphertext_bytes, MAX(created_at) AS last_message_at "
            + "FROM chat_messages WHERE key_version = 2 GROUP BY conversation_id) messages ON messages.conversation_id = c.id "
            + "ORDER BY c.updated_at DESC LIMIT ?",
        (resultSet, rowNum) ->
            new ConversationRecord(
                resultSet.getString("id"),
                resultSet.getString("title"),
                resultSet.getInt("member_count"),
                resultSet.getString("created_by"),
                resultSet.getString("created_at"),
                resultSet.getString("updated_at"),
                resultSet.getLong("message_count"),
                resultSet.getLong("ciphertext_bytes"),
                resultSet.getString("last_message_at")),
        boundedLimit(limit));
  }

  @Override
  public List<MessageRecord> recentMessages(int limit) {
    return jdbc.query(
        "SELECT id, conversation_id, sender_id, OCTET_LENGTH(ciphertext) + OCTET_LENGTH(nonce) AS ciphertext_bytes, created_at "
            + "FROM chat_messages WHERE key_version = 2 ORDER BY created_at DESC, id DESC LIMIT ?",
        (resultSet, rowNum) ->
            new MessageRecord(
                resultSet.getString("id"),
                resultSet.getString("conversation_id"),
                resultSet.getString("sender_id"),
                resultSet.getLong("ciphertext_bytes"),
                resultSet.getString("created_at")),
        boundedLimit(limit));
  }

  private int boundedLimit(int limit) {
    return Math.max(1, Math.min(limit, 200));
  }
}
