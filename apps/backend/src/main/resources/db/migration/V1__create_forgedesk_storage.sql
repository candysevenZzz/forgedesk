CREATE TABLE IF NOT EXISTS user_accounts (
    id CHAR(36) NOT NULL,
    username VARCHAR(32) NOT NULL,
    display_name VARCHAR(48) NOT NULL,
    role VARCHAR(16) NOT NULL,
    password_hash VARCHAR(512) NOT NULL,
    salt VARCHAR(128) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    avatar_version VARCHAR(64) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_accounts_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_avatars (
    user_id CHAR(36) NOT NULL,
    content MEDIUMBLOB NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_avatars_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_conversations (
    id CHAR(36) NOT NULL,
    title VARCHAR(64) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_chat_conversations_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_conversation_members (
    conversation_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    member_order SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (conversation_id, user_id),
    KEY idx_chat_members_user_conversation (user_id, conversation_id),
    CONSTRAINT fk_chat_members_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_members_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
    id CHAR(36) NOT NULL,
    conversation_id CHAR(36) NOT NULL,
    sender_id CHAR(36) NOT NULL,
    ciphertext MEDIUMTEXT NOT NULL,
    nonce VARCHAR(1024) NOT NULL,
    key_version INT NOT NULL,
    key_envelopes JSON NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_chat_messages_conversation_created (conversation_id, created_at, id),
    CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_group_keys (
    conversation_id CHAR(36) NOT NULL,
    key_version INT NOT NULL,
    key_envelopes JSON NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (conversation_id),
    CONSTRAINT fk_chat_group_keys_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_device_keys (
    device_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    public_key_jwk MEDIUMTEXT NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (device_id),
    KEY idx_chat_device_keys_user (user_id),
    CONSTRAINT fk_chat_device_keys_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS translation_configurations (
    user_id CHAR(36) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    app_id TEXT NOT NULL,
    app_key TEXT NOT NULL,
    app_secret TEXT NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id, provider),
    CONSTRAINT fk_translation_configurations_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_note_archives (
    user_id CHAR(36) NOT NULL,
    archive JSON NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_work_note_archives_user FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
