import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Menu, Search, Settings2, UserRound, X, LogOut, UserPlus, Sliders } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { navigationGroups } from "../data/site";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ThemePanel } from "./ThemePanel";
import { AuthModal } from "./AuthModal";
import { ThemeToggleSwitch } from "./ThemeToggleSwitch";
import { useAuth } from "../context/AuthContext";

const links = [
  ...navigationGroups[0].links,
  { label: "Truyện audio", href: "/truyen/audio" },
  { label: "Hội viên", href: "/hoi-vien" },
];

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Only close if not clicking the toggle button itself
        const target = event.target as HTMLElement;
        if (!target.closest(".menu-button")) {
          setMenuOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(`/tim-kiem?q=${encodeURIComponent(query.trim())}`);
    setMenuOpen(false);
  }

  function handleAccountClick() {
    if (user) {
      setProfileOpen(true);
    } else {
      setAuthTab("login");
      setAuthOpen(true);
    }
  }

  return (
    <header className="site-header" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
      <div className="header-inner container">
        <Link className="brand" to="/" aria-label="Người Yêu Cũ, trang chủ">
          <Icon icon={BookOpen} size={24} />
          <span>Người Yêu <strong>Cũ</strong></span>
        </Link>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          {links.map(({ label, href }) => <NavLink key={href} to={href} end={href === "/"}>{label}</NavLink>)}
        </nav>
        <form className="header-search" role="search" onSubmit={search}>
          <label className="sr-only" htmlFor="site-search">Tìm truyện</label>
          <input id="site-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm truyện..." />
          <button type="submit" aria-label="Tìm kiếm"><Icon icon={Search} /></button>
        </form>
        <div className="header-actions">
          {/* Switch Giao diện Sáng / Tối (uiverse JustCode14/red-dingo-61) */}
          <ThemeToggleSwitch />
          
          {user ? (
            <button
              type="button"
              className="user-badge-button"
              aria-label={`Tài khoản ${user.display_name}`}
              onClick={handleAccountClick}
            >
              <span className="user-avatar-circle" style={{ backgroundColor: user.avatar_color || "var(--color-accent)" }}>
                {user.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="user-name-text">{user.display_name}</span>
            </button>
          ) : (
            <button
              type="button"
              className="icon-button account-button"
              aria-label="Đăng nhập tài khoản"
              onClick={handleAccountClick}
            >
              <Icon icon={UserRound} />
            </button>
          )}

          <button
            type="button"
            className="icon-button menu-button"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu-dropdown"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon icon={menuOpen ? X : Menu} />
          </button>
        </div>
      </div>

      {/* Menu 3 Gạch: Gồm Setting Giao diện đọc truyện và Điều hướng */}
      {menuOpen && (
        <div className="site-menu-dropdown-wrapper container" ref={menuRef}>
          <nav id="site-menu-dropdown" className="site-menu-dropdown" aria-label="Menu điều hướng và cài đặt">
            {/* Tùy chỉnh Giao diện đọc truyện */}
            <button
              type="button"
              className="menu-item-button highlight"
              aria-label="Tùy chỉnh giao diện"
              onClick={() => {
                setMenuOpen(false);
                setThemeOpen(true);
              }}
            >
              <div className="menu-item-icon">
                <Icon icon={Settings2} size={20} />
              </div>
              <div className="menu-item-content">
                <span className="menu-item-title">Giao diện đọc truyện</span>
                <span className="menu-item-desc">Cỡ chữ, giãn dòng, màu nền, chủ đề...</span>
              </div>
            </button>

            <div className="menu-divider" />

            {/* Danh mục điều hướng */}
            <div className="menu-nav-section">
              <span className="menu-section-title">Danh mục</span>
              {links.map(({ label, href }) => (
                <NavLink
                  key={href}
                  to={href}
                  end={href === "/"}
                  className="menu-item-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}
      
      {/* Giao diện đọc truyện Modal */}
      <Modal id="appearance-panel" open={themeOpen} title="Giao diện đọc truyện" onClose={() => setThemeOpen(false)}>
        {themeOpen && <ThemePanel />}
      </Modal>

      {/* Đăng nhập / Đăng ký Modal */}
      <AuthModal
        open={authOpen}
        defaultTab={authTab}
        onClose={() => setAuthOpen(false)}
      />

      {/* Hồ sơ cá nhân Modal */}
      {user && (
        <Modal open={profileOpen} title="Hồ Sơ Cá Nhân" onClose={() => setProfileOpen(false)}>
          <div className="user-profile-modal-body">
            <div className="user-profile-header">
              <div className="user-profile-avatar-large" style={{ backgroundColor: user.avatar_color || "var(--color-accent)" }}>
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="user-profile-info">
                <h4 className="user-profile-name">{user.display_name}</h4>
                <p className="user-profile-handle">@{user.username}</p>
                <span className="user-profile-badge">Thành viên gia đình</span>
              </div>
            </div>

            <div className="user-profile-actions">
              <button
                type="button"
                className="user-profile-btn"
                onClick={() => {
                  setProfileOpen(false);
                  setThemeOpen(true);
                }}
              >
                <Icon icon={Sliders} size={18} />
                <span>Cài Đặt Đọc & Chủ Đề Cá Nhân</span>
              </button>

              <button
                type="button"
                className="user-profile-btn"
                onClick={() => {
                  setProfileOpen(false);
                  setAuthTab("register");
                  setAuthOpen(true);
                }}
              >
                <Icon icon={UserPlus} size={18} />
                <span>Tạo Thêm Tài Khoản Cho Người Khác</span>
              </button>

              <button
                type="button"
                className="user-profile-btn logout"
                onClick={() => {
                  logout();
                  setProfileOpen(false);
                }}
              >
                <Icon icon={LogOut} size={18} />
                <span>Đăng Xuất Khỏi Thiết Bị Này</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}
