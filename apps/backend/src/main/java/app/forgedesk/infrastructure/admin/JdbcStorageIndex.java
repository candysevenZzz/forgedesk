package app.forgedesk.infrastructure.admin;

import app.forgedesk.domain.admin.StorageIndex;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JdbcStorageIndex implements StorageIndex {

  private final JdbcTemplate jdbc;

  @Override
  public List<StoredResource> list() {
    return jdbc.query(
        "SELECT kind, user_id, size_bytes, updated_at FROM ("
            + "SELECT '头像' AS kind, user_id, OCTET_LENGTH(content) AS size_bytes, updated_at FROM user_avatars "
            + "UNION ALL "
            + "SELECT '工作笔记归档', user_id, OCTET_LENGTH(CAST(archive AS CHAR)), updated_at FROM work_note_archives "
            + "UNION ALL "
            + "SELECT '翻译配置', user_id, OCTET_LENGTH(app_id) + OCTET_LENGTH(app_key) + OCTET_LENGTH(app_secret), updated_at FROM translation_configurations "
            + "UNION ALL "
            + "SELECT '聊天密文', sender_id, SUM(OCTET_LENGTH(ciphertext) + OCTET_LENGTH(nonce) + OCTET_LENGTH(CAST(key_envelopes AS CHAR))), MAX(created_at) "
            + "FROM chat_messages GROUP BY sender_id"
            + ") records ORDER BY updated_at DESC",
        (resultSet, rowNum) ->
            new StoredResource(
                resultSet.getString("kind"),
                resultSet.getString("user_id"),
                resultSet.getLong("size_bytes"),
                resultSet.getString("updated_at")));
  }
}
