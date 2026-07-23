package app.forgedesk.translation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

public record TranslationRequest(
        @NotBlank String provider,
        @NotBlank String text,
        @NotBlank String sourceLanguage,
        @NotBlank String targetLanguage,
        @Valid ProviderCredentials credentials
) {
    public record ProviderCredentials(String appId, String appKey, String appSecret) {
    }
}
