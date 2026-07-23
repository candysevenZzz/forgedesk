package app.forgedesk.domain.translation;

import java.util.Arrays;

public enum TranslationProvider {
  BAIDU("baidu"),
  YOUDAO("youdao"),
  GOOGLE("google"),
  ALIBABA("alibaba");

  private final String id;

  TranslationProvider(String id) {
    this.id = id;
  }

  public String id() {
    return id;
  }

  public static TranslationProvider from(String value) {
    return Arrays.stream(values())
        .filter(provider -> provider.id.equals(value))
        .findFirst()
        .orElseThrow(() -> new TranslationException("不支持的翻译厂商：" + value));
  }
}
