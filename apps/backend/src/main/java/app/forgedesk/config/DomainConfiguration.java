package app.forgedesk.config;

import app.forgedesk.domain.worknotes.WorkNotesArchiveMerger;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DomainConfiguration {

  @Bean
  WorkNotesArchiveMerger workNotesArchiveMerger(ObjectMapper objectMapper) {
    return new WorkNotesArchiveMerger(objectMapper);
  }
}
