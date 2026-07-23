package app.forgedesk.interfaces.security;

import app.forgedesk.application.auth.AuthApplicationService.UserIdentity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public final class RequestIdentity {

  static final String ATTRIBUTE = RequestIdentity.class.getName();

  private RequestIdentity() {}

  public static UserIdentity current() {
    Object identity = request().getAttribute(ATTRIBUTE);
    if (identity instanceof UserIdentity user) {
      return user;
    }
    throw new IllegalStateException("当前请求没有经过登录校验");
  }

  static HttpServletRequest request() {
    if (RequestContextHolder.getRequestAttributes()
        instanceof ServletRequestAttributes attributes) {
      return attributes.getRequest();
    }
    throw new IllegalStateException("当前执行上下文没有 HTTP 请求");
  }
}
