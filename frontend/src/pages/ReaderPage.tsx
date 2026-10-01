import { Link, useNavigate, useParams } from "react-router-dom";
import { ReaderToolbar } from "../components/ReaderToolbar";
import { chapters } from "../data/site";
import { stories } from "../data/stories";
import { NotFoundPage } from "./NotFoundPage";

export function ReaderPage() {
  const navigate = useNavigate();
  const { slug, chapter } = useParams();
  const story = stories.find((item) => item.slug === slug);
  const number = chapter && /^[1-9]\d*$/.test(chapter) ? Number(chapter) : NaN;
  if (!story || !Number.isSafeInteger(number) || number > story.chapters) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const named = chapters.find((item) => item.storyId === story.id && item.number === number);
  return <div className="reader-page"><nav className="reading-breadcrumb" aria-label="Đường dẫn"><Link to={path}>{story.title}</Link><span aria-hidden="true">/</span><span>Chương {number}</span></nav><header className="reader-heading"><p className="eyebrow">ĐỌC TRUYỆN</p><h1>Chương {number}{named ? `: ${named.title}` : ""}</h1><p>{story.title} · {story.author}</p></header><ReaderToolbar storyPath={path} /><nav className="reader-chapter-nav" aria-label="Điều hướng chương">{number > 1 ? <Link className="button" to={`${path}/doc/${number - 1}`}>Chương trước</Link> : <span />}<label>Chọn chương <select aria-label="Chọn chương" value={number} onChange={(event) => navigate(`${path}/doc/${event.target.value}`)}>{Array.from({ length: story.chapters }, (_, index) => <option key={index + 1} value={index + 1}>Chương {index + 1}</option>)}</select></label>{number < story.chapters ? <Link className="button" to={`${path}/doc/${number + 1}`}>Chương sau</Link> : <span />}</nav><article className="reader-article"><p>{story.description}</p><p>Đây là nội dung chương mẫu của bản xem trước. Nội dung đầy đủ sẽ được cập nhật khi truyện được xuất bản.</p><p>Hãy chọn chương tiếp theo để tiếp tục khám phá hành trình trong <em>{story.title}</em>.</p></article><nav className="reader-chapter-nav" aria-label="Điều hướng cuối chương">{number > 1 && <Link className="button" to={`${path}/doc/${number - 1}`}>Chương trước</Link>}{number < story.chapters && <Link className="button button-primary" to={`${path}/doc/${number + 1}`}>Chương sau</Link>}<a className="button" href="#main-content">Về đầu trang</a></nav></div>;
}
