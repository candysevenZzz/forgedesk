package app.forgedesk.interfaces.rest;

public record ApiResult<T>(String code, String message, T data, String traceId) {

  public static <T> ApiResult<T> success(T data) {
    return new ApiResult<>("OK", "", data, TraceContext.currentId());
  }

  public static <T> ApiResult<T> failure(String code, String message) {
    return new ApiResult<>(code, message, null, TraceContext.currentId());
  }
}
