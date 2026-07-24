package app.forgedesk.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "forgedesk.web")
public record ForgeDeskWebProperties(List<String> allowedOrigins) {

  public String[] allowedOriginsArray() {
    return allowedOrigins == null
        ? new String[0]
        : allowedOrigins.stream()
            .filter(value -> value != null && !value.isBlank())
            .toArray(String[]::new);
  }
}
