ALTER TABLE chat_conversations
    ADD COLUMN announcement VARCHAR(280) NOT NULL DEFAULT '' AFTER title;
