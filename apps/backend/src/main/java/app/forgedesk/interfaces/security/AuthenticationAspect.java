package app.forgedesk.interfaces.security;

import app.forgedesk.application.auth.AuthApplicationService;
import app.forgedesk.interfaces.rest.RestAuthentication;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;

@Aspect
@Component
@RequiredArgsConstructor
public class AuthenticationAspect {

  private final AuthApplicationService authService;

  @Around(
      "@annotation(app.forgedesk.interfaces.security.RequireLogin) || @within(app.forgedesk.interfaces.security.RequireLogin)")
  public Object authenticate(ProceedingJoinPoint joinPoint) throws Throwable {
    RequireLogin policy = policyFor(joinPoint);
    HttpServletRequest request = RequestIdentity.request();
    AuthApplicationService.UserIdentity user =
        policy.admin()
            ? authService.requireAdmin(RestAuthentication.bearerToken(request))
            : authService.requireUser(RestAuthentication.bearerToken(request));
    Object previousIdentity = request.getAttribute(RequestIdentity.ATTRIBUTE);
    request.setAttribute(RequestIdentity.ATTRIBUTE, user);
    try {
      return joinPoint.proceed();
    } finally {
      if (previousIdentity == null) {
        request.removeAttribute(RequestIdentity.ATTRIBUTE);
      } else {
        request.setAttribute(RequestIdentity.ATTRIBUTE, previousIdentity);
      }
    }
  }

  private RequireLogin policyFor(ProceedingJoinPoint joinPoint) {
    Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
    RequireLogin policy = AnnotatedElementUtils.findMergedAnnotation(method, RequireLogin.class);
    if (policy != null) {
      return policy;
    }
    policy =
        AnnotatedElementUtils.findMergedAnnotation(
            joinPoint.getTarget().getClass(), RequireLogin.class);
    if (policy != null) {
      return policy;
    }
    throw new IllegalStateException("登录切面未找到登录策略");
  }
}
