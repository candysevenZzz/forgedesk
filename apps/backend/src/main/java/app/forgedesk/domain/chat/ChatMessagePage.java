package app.forgedesk.domain.chat;

import java.util.List;

/** 聊天密文分页结果。首次读取只返回最新一页；实时同步使用 {@code nextAfter} 拉取更晚消息，新设备迁移使用 {@code previousBefore} 向前遍历历史。 */
public record ChatMessagePage(
    List<EncryptedChatMessage> messages,
    String nextAfter,
    String previousBefore,
    boolean hasMoreAfter,
    boolean hasMoreBefore) {}
