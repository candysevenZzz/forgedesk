package app.forgedesk.application.translation;

import app.forgedesk.domain.translation.TranslationCommand;
import app.forgedesk.domain.translation.TranslationCredentials;
import app.forgedesk.domain.translation.TranslationGateway;
import app.forgedesk.domain.translation.TranslationProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TranslationApplicationService {

  private final TranslationConfigurationApplicationService configurationService;

  private final TranslationGateway gateway;

  public TranslationResult translate(
      String userId, String providerId, String text, String sourceLanguage, String targetLanguage) {
    TranslationProvider provider = TranslationProvider.from(providerId);
    TranslationCredentials credentials = configurationService.credentialsFor(userId, provider);
    TranslationCommand command =
        new TranslationCommand(provider, text, sourceLanguage, targetLanguage);
    return new TranslationResult(provider.id(), gateway.translate(command, credentials));
  }

  public record TranslationResult(String provider, String translatedText) {}
}
