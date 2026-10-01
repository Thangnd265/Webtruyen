import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <section className="not-found"><span className="not-found-code">404</span><p className="eyebrow">LẠC TRONG TRANG SÁCH</p><h1>Không tìm thấy trang</h1><p>Trang bạn tìm có thể đã chuyển đi. Cùng trở về và chọn một câu chuyện mới nhé.</p><Link className="button button-primary" to="/">Về trang chủ</Link></section>;
}
