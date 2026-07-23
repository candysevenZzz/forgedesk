package app.forgedesk.interfaces.rest.translation;

import app.forgedesk.application.translation.TranslationApplicationService;
import app.forgedesk.application.translation.TranslationConfigurationApplicationService;
import app.forgedesk.domain.translation.TranslationException;
import app.forgedesk.interfaces.rest.translation.dto.TranslationConfigurationRequest;
import app.forgedesk.interfaces.rest.translation.dto.TranslationConfigurationStatus;
import app.forgedesk.interfaces.rest.translation.dto.TranslationRequest;
import app.forgedesk.interfaces.rest.translation.dto.TranslationResponse;
import app.forgedesk.interfaces.security.RequestIdentity;
import app.forgedesk.interfaces.security.RequireLogin;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequiredArgsConstructor
public class TranslationController {

  private final TranslationApplicationService translationService;

  private final TranslationConfigurationApplicationService configurationService;

  @GetMapping("/api/translation/configuration/{provider}")
  @RequireLogin
  TranslationConfigurationStatus configuration(@PathVariable String provider) {
    try {
      var result = configurationService.status(RequestIdentity.current().id(), provider);
      return new TranslationConfigurationStatus(
          result.provider(), result.configured(), result.updatedAt());
    } catch (TranslationException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
  }

  @PostMapping("/api/translation/configuration/{provider}")
  @RequireLogin
  TranslationConfigurationStatus saveConfiguration(
      @PathVariable String provider, @RequestBody TranslationConfigurationRequest request) {
    try {
      var command =
          new TranslationConfigurationApplicationService.CredentialsCommand(
              request.appId(), request.appKey(), request.appSecret());
      var result = configurationService.save(RequestIdentity.current().id(), provider, command);
      return new TranslationConfigurationStatus(
          result.provider(), result.configured(), result.updatedAt());
    } catch (TranslationException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
  }

  @PostMapping("/api/translation/translate")
  @RequireLogin
  TranslationResponse translate(@Valid @RequestBody TranslationRequest request) {
    try {
      var result =
          translationService.translate(
              RequestIdentity.current().id(),
              request.provider(),
              request.text(),
              request.sourceLanguage(),
              request.targetLanguage());
      return new TranslationResponse(result.provider(), result.translatedText());
    } catch (TranslationException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
    }
  }
}
