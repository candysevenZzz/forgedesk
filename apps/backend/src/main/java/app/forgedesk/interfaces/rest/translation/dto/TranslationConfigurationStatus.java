package app.forgedesk.interfaces.rest.translation.dto;

public record TranslationConfigurationStatus(
    String provider, boolean configured, String updatedAt) {}
