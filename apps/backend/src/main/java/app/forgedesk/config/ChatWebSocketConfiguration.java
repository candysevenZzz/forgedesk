package app.forgedesk.config;

import app.forgedesk.infrastructure.chat.ChatWebSocketHub;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class ChatWebSocketConfiguration implements WebSocketConfigurer {

  private final ChatWebSocketHub hub;

  private final ForgeDeskWebProperties webProperties;

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry.addHandler(hub, "/ws/chat").setAllowedOrigins(webProperties.allowedOriginsArray());
  }
}
