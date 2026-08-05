CREATE TABLE IF NOT EXISTS landlord_rooms (
    id CHAR(36) NOT NULL,
    owner_id CHAR(36) NOT NULL,
    status VARCHAR(16) NOT NULL,
    state JSON NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_landlord_rooms_status_updated (status, updated_at),
    CONSTRAINT fk_landlord_rooms_owner FOREIGN KEY (owner_id) REFERENCES user_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
