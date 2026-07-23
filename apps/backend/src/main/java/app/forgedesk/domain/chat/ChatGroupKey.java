package app.forgedesk.domain.chat;

import java.util.Map;

/** 群会话密钥的设备信封。服务端只保存信封，无法恢复群密钥明文。 */
public record ChatGroupKey(
    String conversationId, int keyVersion, Map<String, String> keyEnvelopes, String updatedAt) {}
