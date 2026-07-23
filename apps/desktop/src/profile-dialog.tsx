import { useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { assetUrl, updateAvatar, updatePassword, updateProfile, type AuthUser } from "./api";

export function ProfileDialog(props: { user: AuthUser; onUpdated: (user: AuthUser) => void; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(props.user.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [preview, setPreview] = useState(props.user.avatarUrl ? assetUrl(props.user.avatarUrl) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveProfile() {
    setSaving(true);
    setError("");
    try {
      props.onUpdated(await updateProfile(displayName));
    } catch (value) {
      setError(value instanceof Error ? value.message : "无法保存资料");
    } finally {
      setSaving(false);
    }
  }
  async function savePassword() {
    setSaving(true);
    setError("");
    try {
      props.onUpdated(await updatePassword(currentPassword, newPassword));
      setCurrentPassword("");
      setNewPassword("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "无法修改密码");
    } finally {
      setSaving(false);
    }
  }
  function chooseAvatar(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError("请选择 PNG、JPEG 或 WebP 图片");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setPreview(dataUrl);
      setSaving(true);
      setError("");
      try {
        props.onUpdated(await updateAvatar(dataUrl));
      } catch (value) {
        setError(value instanceof Error ? value.message : "无法上传头像");
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header>
          <div>
            <h2 id="profile-title">个人资料</h2>
            <p>{props.user.username}</p>
          </div>
          <button className="auth-close" type="button" onClick={props.onClose} aria-label="关闭资料设置">
            ×
          </button>
        </header>
        <div className="profile-avatar-row">
          <span className="profile-avatar">
            {preview ? <img src={preview} alt="个人头像" /> : <UserRound size={28} aria-hidden="true" />}
          </span>
          <label className="profile-avatar-action">
            <Camera size={15} aria-hidden="true" />
            更换头像
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => chooseAvatar(event.target.files?.[0])}
            />
          </label>
        </div>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <label>
            <span>昵称</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="显示在工作台中"
              required
            />
          </label>
          <button className="translation-submit" type="submit" disabled={saving}>
            保存昵称
          </button>
        </form>
        <form
          className="auth-form profile-password-form"
          onSubmit={(event) => {
            event.preventDefault();
            void savePassword();
          }}
        >
          <strong>修改密码</strong>
          <label>
            <span>当前密码</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="至少 10 位"
              required
            />
          </label>
          <button className="translation-submit" type="submit" disabled={saving}>
            更新密码
          </button>
        </form>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
