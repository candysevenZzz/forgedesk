package app.forgedesk.translation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class TranslationService {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(REQUEST_TIMEOUT).build();
    private final ObjectMapper objectMapper;

    public TranslationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public TranslationResponse translate(TranslationRequest request) {
        Provider provider = Provider.from(request.provider());
        var credentials = request.credentials();
        if (credentials == null) {
            throw new TranslationException("请先填写该翻译厂商的凭证");
        }

        String translatedText = switch (provider) {
            case BAIDU -> baidu(request, credentials);
            case YOUDAO -> youdao(request, credentials);
            case GOOGLE -> google(request, credentials);
            case ALIBABA -> alibaba(request, credentials);
        };
        return new TranslationResponse(provider.id, translatedText);
    }

    private String baidu(TranslationRequest request, TranslationRequest.ProviderCredentials credentials) {
        require(credentials.appId(), "百度 App ID");
        require(credentials.appKey(), "百度 App Key");
        String salt = UUID.randomUUID().toString().replace("-", "");
        String sign = md5(credentials.appId() + request.text() + salt + credentials.appKey());
        Map<String, String> form = new LinkedHashMap<>();
        form.put("q", request.text());
        form.put("from", baiduLanguage(request.sourceLanguage()));
        form.put("to", baiduLanguage(request.targetLanguage()));
        form.put("appid", credentials.appId());
        form.put("salt", salt);
        form.put("sign", sign);
        JsonNode body = postForm("https://fanyi-api.baidu.com/api/trans/vip/translate", form);
        return body.path("trans_result").path(0).path("dst").asText(errorMessage(body, "百度翻译未返回结果"));
    }

    private String youdao(TranslationRequest request, TranslationRequest.ProviderCredentials credentials) {
        require(credentials.appKey(), "有道 App Key");
        require(credentials.appSecret(), "有道 App Secret");
        String salt = UUID.randomUUID().toString();
        String currentTime = String.valueOf(Instant.now().getEpochSecond());
        String sign = sha256(credentials.appKey() + truncate(request.text()) + salt + currentTime + credentials.appSecret());
        Map<String, String> form = new LinkedHashMap<>();
        form.put("q", request.text());
        form.put("from", youdaoLanguage(request.sourceLanguage()));
        form.put("to", youdaoLanguage(request.targetLanguage()));
        form.put("appKey", credentials.appKey());
        form.put("salt", salt);
        form.put("curtime", currentTime);
        form.put("signType", "v3");
        form.put("sign", sign);
        JsonNode body = postForm("https://openapi.youdao.com/api", form);
        if (!"0".equals(body.path("errorCode").asText())) {
            throw new TranslationException("有道翻译请求失败：" + body.path("errorCode").asText());
        }
        return body.path("translation").path(0).asText("有道翻译未返回结果");
    }

    private String google(TranslationRequest request, TranslationRequest.ProviderCredentials credentials) {
        require(credentials.appKey(), "Google Cloud API Key");
        try {
            String payload = objectMapper.writeValueAsString(Map.of(
                    "q", request.text(),
                    "source", googleLanguage(request.sourceLanguage()),
                    "target", googleLanguage(request.targetLanguage()),
                    "format", "text"));
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create("https://translation.googleapis.com/language/translate/v2?key=" + percentEncode(credentials.appKey())))
                    .timeout(REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .build();
            JsonNode body = send(httpRequest);
            return body.path("data").path("translations").path(0).path("translatedText").asText(errorMessage(body, "Google 翻译未返回结果"));
        } catch (Exception exception) {
            throw wrap(exception);
        }
    }

    private String alibaba(TranslationRequest request, TranslationRequest.ProviderCredentials credentials) {
        require(credentials.appId(), "阿里云 AccessKey ID");
        require(credentials.appKey(), "阿里云 AccessKey Secret");
        Map<String, String> parameters = new TreeMap<>();
        parameters.put("Action", "TranslateGeneral");
        parameters.put("Format", "JSON");
        parameters.put("AccessKeyId", credentials.appId());
        parameters.put("SignatureMethod", "HMAC-SHA1");
        parameters.put("SignatureNonce", UUID.randomUUID().toString());
        parameters.put("SignatureVersion", "1.0");
        parameters.put("Timestamp", DateTimeFormatter.ISO_INSTANT.format(Instant.now()));
        parameters.put("Version", "2018-10-12");
        parameters.put("SourceText", request.text());
        parameters.put("SourceLanguage", alibabaLanguage(request.sourceLanguage()));
        parameters.put("TargetLanguage", alibabaLanguage(request.targetLanguage()));
        parameters.put("Scene", "general");
        String canonicalizedQuery = formBody(parameters);
        String stringToSign = "POST&%2F&" + percentEncode(canonicalizedQuery);
        parameters.put("Signature", hmacSha1(credentials.appKey() + "&", stringToSign));
        JsonNode body = postForm("https://mt.cn-hangzhou.aliyuncs.com/", parameters);
        return body.path("Data").path("Translated").asText(errorMessage(body, "阿里云翻译未返回结果"));
    }

    private JsonNode postForm(String endpoint, Map<String, String> form) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(formBody(form), StandardCharsets.UTF_8))
                .build();
        return send(request);
    }

    private JsonNode send(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode body = objectMapper.readTree(response.body());
            if (response.statusCode() >= 400) {
                throw new TranslationException(errorMessage(body, "翻译服务请求失败（HTTP " + response.statusCode() + "）"));
            }
            return body;
        } catch (TranslationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw wrap(exception);
        }
    }

    private TranslationException wrap(Exception exception) {
        return new TranslationException("翻译服务连接失败：" + exception.getMessage());
    }

    private String errorMessage(JsonNode body, String fallback) {
        return body.path("error_msg").asText(body.path("Error").path("Message").asText(body.path("error").path("message").asText(fallback)));
    }

    private void require(String value, String label) {
        if (value == null || value.isBlank()) throw new TranslationException("请填写" + label);
    }

    private String formBody(Map<String, String> values) {
        return values.entrySet().stream().map(entry -> percentEncode(entry.getKey()) + "=" + percentEncode(entry.getValue())).reduce((left, right) -> left + "&" + right).orElse("");
    }

    private String percentEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20").replace("%7E", "~").replace("*", "%2A");
    }

    private String md5(String value) {
        return hex("MD5", value);
    }

    private String sha256(String value) {
        return hex("SHA-256", value);
    }

    private String hex(String algorithm, String value) {
        try {
            byte[] digest = MessageDigest.getInstance(algorithm).digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte item : digest) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("无法创建签名", exception);
        }
    }

    private String hmacSha1(String key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("无法创建阿里云签名", exception);
        }
    }

    private String truncate(String value) {
        return value.length() <= 20 ? value : value.substring(0, 10) + value.length() + value.substring(value.length() - 10);
    }

    private String baiduLanguage(String language) { return language.equals("zh") ? "zh" : language; }
    private String youdaoLanguage(String language) { return language.equals("zh") ? "zh-CHS" : language; }
    private String googleLanguage(String language) { return language.equals("zh") ? "zh-CN" : language; }
    private String alibabaLanguage(String language) { return language.equals("zh") ? "zh" : language; }

    private enum Provider {
        BAIDU("baidu"), YOUDAO("youdao"), GOOGLE("google"), ALIBABA("alibaba");

        private final String id;

        Provider(String id) { this.id = id; }

        static Provider from(String value) {
            for (Provider provider : values()) if (provider.id.equals(value)) return provider;
            throw new TranslationException("不支持的翻译厂商：" + value);
        }
    }

    public static class TranslationException extends RuntimeException {
        TranslationException(String message) { super(message); }
    }
}
