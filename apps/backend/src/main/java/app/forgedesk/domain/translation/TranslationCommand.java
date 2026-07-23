package app.forgedesk.domain.translation;

public record TranslationCommand(
    TranslationProvider provider, String text, String sourceLanguage, String targetLanguage) {}
