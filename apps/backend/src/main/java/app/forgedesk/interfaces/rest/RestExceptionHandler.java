package app.forgedesk.interfaces.rest;

import app.forgedesk.domain.auth.AuthenticationException;
import app.forgedesk.domain.chat.ChatException;
import app.forgedesk.domain.landlord.LandlordGameException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class RestExceptionHandler {

  @ExceptionHandler(AuthenticationException.class)
  public ResponseEntity<ApiResult<Void>> authentication(AuthenticationException exception) {
    HttpStatus status =
        switch (exception.reason()) {
          case INVALID_REQUEST -> HttpStatus.BAD_REQUEST;
          case CONFLICT -> HttpStatus.CONFLICT;
          case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
          case FORBIDDEN -> HttpStatus.FORBIDDEN;
        };
    return ResponseEntity.status(status)
        .body(ApiResult.failure(exception.reason().name(), exception.getMessage()));
  }

  @ExceptionHandler
  public ResponseEntity<ApiResult<Void>> invalidArgument(IllegalArgumentException exception) {
    return ResponseEntity.badRequest()
        .body(ApiResult.failure("INVALID_REQUEST", exception.getMessage()));
  }

  @ExceptionHandler(ChatException.class)
  public ResponseEntity<ApiResult<Void>> chat(ChatException exception) {
    return ResponseEntity.badRequest()
        .body(ApiResult.failure("CHAT_ERROR", exception.getMessage()));
  }

  @ExceptionHandler(LandlordGameException.class)
  public ResponseEntity<ApiResult<Void>> landlord(LandlordGameException exception) {
    return ResponseEntity.badRequest()
        .body(ApiResult.failure("LANDLORD_GAME_ERROR", exception.getMessage()));
  }

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<ApiResult<Void>> responseStatus(ResponseStatusException exception) {
    return ResponseEntity.status(exception.getStatusCode())
        .body(
            ApiResult.failure(
                exception.getStatusCode().toString(),
                exception.getReason() == null ? "请求失败" : exception.getReason()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiResult<Void>> validation(MethodArgumentNotValidException exception) {
    String message =
        exception.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(error -> error.getField() + " 格式无效")
            .orElse("请求参数无效");
    return ResponseEntity.badRequest().body(ApiResult.failure("VALIDATION_ERROR", message));
  }
}
