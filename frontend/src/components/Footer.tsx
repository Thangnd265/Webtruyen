import { Link } from "react-router-dom";
import { navigationGroups } from "../data/site";

const groups = [
  ...navigationGroups,
  { title: "Thông tin", links: [{ label: "Giới thiệu", href: "/gioi-thieu" }, { label: "Liên hệ", href: "/lien-he" }] },
  { title: "Hỗ trợ", links: [{ label: "Điều khoản", href: "/dieu-khoan" }, { label: "Chính sách", href: "/chinh-sach" }] },
];

export function Footer() {
  return <footer className="site-footer"><div className="container footer-grid">
    <div className="footer-intro"><strong>Tiểu Thuyết Mạng</strong><p>Những câu chuyện hay cho mỗi ngày đọc của bạn.</p></div>
    {groups.map((group) => <nav key={group.title} aria-label={group.title}><h2>{group.title}</h2>{group.links.map(({ label, href }) => <Link key={href} to={href}>{label}</Link>)}</nav>)}
  </div><div className="container footer-bottom">© 2026 Tiểu Thuyết Mạng · Bản xem trước với nội dung mẫu</div></footer>;
}
