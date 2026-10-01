import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

type InfoSection = { heading: string; text: string; items?: string[] };
const fields = [
  { id: "name", label: "Họ và tên", error: "Vui lòng nhập họ và tên." },
  { id: "email", label: "Email", error: "Vui lòng nhập email hợp lệ." },
  { id: "message", label: "Nội dung", error: "Vui lòng nhập nội dung tin nhắn." },
] as const;

export function InfoPage({ title, introduction, sections, contact = false }: { title: string; introduction: string; sections: InfoSection[]; contact?: boolean }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (errors.length) summary.current?.focus(); }, [errors]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = fields.filter(({ id }) => {
      const input = form.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement;
      return !input.value.trim() || !input.validity.valid;
    }).map(({ id }) => id);
    setErrors(invalid);
    setSubmitted(invalid.length === 0);
  }

  return <article className="info-page" aria-labelledby="info-title">
    <header className="page-heading"><p className="eyebrow">NGƯỜI YÊU CŨ</p><h1 id="info-title">{title}</h1><p>{introduction}</p></header>
    <div className="info-content">{sections.map(({ heading, text, items }) => <section key={heading}><h2>{heading}</h2><p>{text}</p>{items && <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}</div>
    {contact && <form className="contact-form" aria-labelledby="contact-title" noValidate onSubmit={submit} onChange={() => setSubmitted(false)}>
      <h2 id="contact-title">Gửi lời nhắn</h2><p id="contact-note">Biểu mẫu minh họa chỉ kiểm tra thông tin trên thiết bị. Tin nhắn không được gửi hay lưu lại sau khi rời trang.</p>
      {errors.length > 0 && <div className="form-feedback" role="alert" tabIndex={-1} ref={summary}><h3>Vui lòng kiểm tra thông tin</h3><ul>{fields.filter(({ id }) => errors.includes(id)).map(({ id, error }) => <li key={id}><a href={`#contact-${id}`}>{error}</a></li>)}</ul></div>}
      {fields.map(({ id, label, error }) => <div className="contact-field" key={id}>
        <label htmlFor={`contact-${id}`}>{label}</label>
        {id === "message" ? <textarea id={`contact-${id}`} name={id} required rows={5} maxLength={3000} aria-invalid={errors.includes(id)} aria-describedby={errors.includes(id) ? `${id}-error` : undefined} /> : <input id={`contact-${id}`} name={id} type={id === "email" ? "email" : "text"} autoComplete={id} required maxLength={id === "email" ? 254 : 100} aria-invalid={errors.includes(id)} aria-describedby={errors.includes(id) ? `${id}-error` : undefined} />}
        {errors.includes(id) && <p className="field-error" id={`${id}-error`}>{error}</p>}
      </div>)}
      <button className="button button-primary" type="submit" aria-describedby="contact-note">Gửi tin nhắn mẫu</button>
      {submitted && <p className="form-feedback" role="status">Thông tin hợp lệ. Đây là bản mẫu; tin nhắn chưa được gửi.</p>}
    </form>}
    <nav className="info-links" aria-label="Thông tin liên quan"><Link to="/gioi-thieu">Giới thiệu</Link><Link to="/lien-he">Liên hệ</Link><Link to="/dieu-khoan">Điều khoản</Link><Link to="/chinh-sach">Chính sách</Link></nav>
  </article>;
}
