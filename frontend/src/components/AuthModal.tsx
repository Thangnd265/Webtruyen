import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icon";
import { LogIn, UserPlus, AlertCircle, Check } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "login" | "register";
}

export function AuthModal({ open, onClose, defaultTab = "login" }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">(defaultTab);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function resetForm() {
    setUsername("");
    setPassword("");
    setDisplayName("");
    setError(null);
    setSuccessMsg(null);
  }

  function handleTabSwitch(newTab: "login" | "register") {
    setTab(newTab);
    resetForm();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setError("Vui lòng nhập tên đăng nhập");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setSubmitting(true);
    try {
      if (tab === "login") {
        const res = await login(cleanUsername, password);
        if (res.success) {
          setSuccessMsg("Đăng nhập thành công!");
          setTimeout(() => {
            resetForm();
            onClose();
          }, 400);
        } else {
          setError(res.error || "Tên đăng nhập hoặc mật khẩu không đúng");
        }
      } else {
        const cleanDisplayName = displayName.trim() || cleanUsername;
        const res = await register(cleanUsername, password, cleanDisplayName);
        if (res.success) {
          setSuccessMsg("Tạo tài khoản thành công!");
          setTimeout(() => {
            resetForm();
            onClose();
          }, 400);
        } else {
          setError(res.error || "Tạo tài khoản thất bại");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      className="spotty-modal"
      title={tab === "login" ? "ĐĂNG NHẬP" : "TẠO TÀI KHOẢN"}
      onClose={() => {
        resetForm();
        onClose();
      }}
    >
      <div className="auth-modal-content">
        {/* Tab switchers */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`auth-tab-btn ${tab === "login" ? "active" : ""}`}
            onClick={() => handleTabSwitch("login")}
          >
            <Icon icon={LogIn} size={16} />
            <span>Đăng Nhập</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={`auth-tab-btn ${tab === "register" ? "active" : ""}`}
            onClick={() => handleTabSwitch("register")}
          >
            <Icon icon={UserPlus} size={16} />
            <span>Đăng Ký</span>
          </button>
        </div>

        {/* Error / Success alerts */}
        {error && (
          <div className="auth-alert error" role="alert">
            <Icon icon={AlertCircle} size={18} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert success" role="status">
            <Icon icon={Check} size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-username">
              Tên đăng nhập <span className="req">*</span>
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              required
              placeholder="Tên đăng nhập"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          {tab === "register" && (
            <div className="auth-field">
              <label htmlFor="auth-display-name">Tên hiển thị / Danh xưng</label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="nickname"
                placeholder="Tên hiển thị (ví dụ: Bố, Mẹ...)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-password">
              Mật khẩu <span className="req">*</span>
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              required
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting}
          >
            {submitting
              ? "ĐANG XỬ LÝ..."
              : tab === "login"
              ? "ĐĂNG NHẬP NGAY"
              : "HOÀN TẤT ĐĂNG KÝ"}
          </button>
        </form>

        <p className="auth-footer-hint">
          {tab === "login" ? (
            <>
              Chưa có tài khoản riêng?{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => handleTabSwitch("register")}
              >
                Tạo tài khoản tại đây
              </button>
            </>
          ) : (
            <>
              Đã có tài khoản?{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => handleTabSwitch("login")}
              >
                Đăng nhập ngay
              </button>
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
