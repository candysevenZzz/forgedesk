package app.forgedesk.interfaces.rest.translation.dto;

import jakarta.validation.constraints.NotBlank;

public record TranslationRequest(
    @NotBlank String provider,
    @NotBlank String text,
    @NotBlank String sourceLanguage,
    @NotBlank String targetLanguage) {}
