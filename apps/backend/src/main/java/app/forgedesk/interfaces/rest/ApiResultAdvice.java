package app.forgedesk.interfaces.rest;

import org.springframework.core.MethodParameter;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@RestControllerAdvice(basePackages = "app.forgedesk.interfaces.rest")
public class ApiResultAdvice implements ResponseBodyAdvice<Object> {

  @Override
  public boolean supports(MethodParameter returnType, Class converterType) {
    return returnType.getContainingClass().isAnnotationPresent(RestController.class)
        && returnType.getParameterType() != byte[].class
        && !Resource.class.isAssignableFrom(returnType.getParameterType())
        && !ResponseEntity.class.isAssignableFrom(returnType.getParameterType());
  }

  @Override
  public Object beforeBodyWrite(
      Object body,
      MethodParameter returnType,
      MediaType contentType,
      Class converterType,
      ServerHttpRequest request,
      ServerHttpResponse response) {
    return body instanceof ApiResult<?> ? body : ApiResult.success(body);
  }
}
