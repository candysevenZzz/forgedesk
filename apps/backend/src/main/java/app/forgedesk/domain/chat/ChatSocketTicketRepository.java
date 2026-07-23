package app.forgedesk.domain.chat;

import java.util.Optional;

public interface ChatSocketTicketRepository {

  void save(ChatSocketTicket ticket);

  Optional<ChatSocketTicket> consume(String tokenHash);

  void removeExpired(String now);
}
