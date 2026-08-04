package app.forgedesk.config;

import java.util.Arrays;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "forgedesk.web")
public record ForgeDeskWebProperties(String allowedOrigins) {

  public String[] allowedOriginsArray() {
    if (allowedOrigins == null || allowedOrigins.isBlank()) {
      return new String[0];
    }
    return Arrays.stream(allowedOrigins.split(","))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .toArray(String[]::new);
  }
}
