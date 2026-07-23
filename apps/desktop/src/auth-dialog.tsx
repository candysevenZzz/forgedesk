import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { loginAccount, registerAccount, type AuthResult } from "./api";

export function AuthDialog(props: { onAuthenticated: (result: AuthResult) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await loginAccount({ username, password })
          : await registerAccount({ username, displayName, password, bootstrapToken });
      props.onAuthenticated(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
        <div className="auth-dialog-head">
          <span className="auth-dialog-icon">
            {mode === "login" ? <KeyRound size={19} aria-hidden="true" /> : <UserPlus size={19} aria-hidden="true" />}
          </span>
          <div>
            <h2 id="auth-dialog-title">{mode === "login" ? "登录服务空间" : "创建服务账号"}</h2>
            <p>
              {mode === "login"
                ? "使用自己的身份访问同步、翻译和授权服务。"
                : "本地服务首个账号为管理员；远端首次初始化需要管理员口令。"}
            </p>
          </div>
          <button className="auth-close" type="button" onClick={props.onClose} aria-label="关闭登录窗口">
            ×
          </button>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例如 candy.seven"
              autoComplete="username"
              required
            />
          </label>
          {mode === "register" ? (
            <label>
              <span>显示名称</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="显示在工作台中"
                autoComplete="name"
              />
            </label>
          ) : null}
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "register" ? "至少 10 位" : "输入密码"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "register" ? (
            <label>
              <span>管理员初始化口令（仅远端首次注册）</span>
              <input
                type="password"
                value={bootstrapToken}
                onChange={(event) => setBootstrapToken(event.target.value)}
                placeholder="本地服务无需填写"
                autoComplete="off"
              />
            </label>
          ) : null}
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="auth-form-actions">
            <button
              className="auth-switch"
              type="button"
              onClick={() => {
                setMode((current) => (current === "login" ? "register" : "login"));
                setError("");
              }}
            >
              {mode === "login" ? "注册账号" : "已有账号，登录"}
            </button>
            <button className="translation-submit" type="submit" disabled={submitting}>
              {submitting ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
