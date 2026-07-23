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

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    registry
        .addHandler(hub, "/ws/chat")
        .setAllowedOrigins("http://127.0.0.1:1420", "http://localhost:1420");
  }
}
