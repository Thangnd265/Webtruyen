import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Menu, Search, Settings2, UserRound, X } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { navigationGroups } from "../data/site";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ThemePanel } from "./ThemePanel";

const links = [
  ...navigationGroups[0].links,
  { label: "Truyện audio", href: "/truyen/audio" },
  { label: "Hội viên", href: "/hoi-vien" },
];

export function Header() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnDesktop = () => { if (window.innerWidth >= 1100) setMenuOpen(false); };
    window.addEventListener("resize", closeOnDesktop);
    closeOnDesktop();
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, [menuOpen]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(`/tim-kiem?q=${encodeURIComponent(query.trim())}`);
    setMenuOpen(false);
  }

  return <header className="site-header" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
    <div className="header-inner container">
      <Link className="brand" to="/" aria-label="Người Yêu Cũ, trang chủ"><Icon icon={BookOpen} size={24} /><span>Người Yêu <strong>Cũ</strong></span></Link>
      <nav className="desktop-nav" aria-label="Điều hướng chính">{links.map(({ label, href }) => <NavLink key={href} to={href} end={href === "/"}>{label}</NavLink>)}</nav>
      <form className="header-search" role="search" onSubmit={search}>
        <label className="sr-only" htmlFor="site-search">Tìm truyện</label>
        <input id="site-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm truyện..." />
        <button type="submit" aria-label="Tìm kiếm"><Icon icon={Search} /></button>
      </form>
      <div className="header-actions">
        <button type="button" className="icon-button" aria-label="Tùy chỉnh giao diện" aria-expanded={themeOpen} aria-controls="appearance-panel" onClick={() => setThemeOpen(!themeOpen)}><Icon icon={Settings2} /></button>
        <button type="button" className="icon-button account-button" aria-label="Tài khoản" onClick={() => setAccountOpen(true)}><Icon icon={UserRound} /></button>
        <button type="button" className="icon-button menu-button" aria-label={menuOpen ? "Đóng menu" : "Mở menu"} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(!menuOpen)}><Icon icon={menuOpen ? X : Menu} /></button>
      </div>
    </div>
    {menuOpen && <nav id="mobile-nav" className="mobile-nav container" aria-label="Điều hướng di động">{links.map(({ label, href }) => <NavLink key={href} to={href} end={href === "/"} onClick={() => setMenuOpen(false)}>{label}</NavLink>)}</nav>}
    <Modal id="appearance-panel" open={themeOpen} title="Giao diện đọc truyện" onClose={() => setThemeOpen(false)}>{themeOpen && <ThemePanel />}</Modal>
    <Modal open={accountOpen} title="Tài khoản mẫu" onClose={() => setAccountOpen(false)}><p>Đăng nhập và tài khoản chưa có trong bản xem trước.</p></Modal>
  </header>;
}
