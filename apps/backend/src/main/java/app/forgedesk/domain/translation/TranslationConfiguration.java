package app.forgedesk.domain.translation;

public record TranslationConfiguration(
    TranslationProvider provider, TranslationCredentials credentials, String updatedAt) {}
