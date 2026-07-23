package app.forgedesk.domain.translation;

public interface TranslationGateway {

  String translate(TranslationCommand command, TranslationCredentials credentials);
}
