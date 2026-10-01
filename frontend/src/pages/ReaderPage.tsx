import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ReaderToolbar } from "../components/ReaderToolbar";
import { getStoryDetail, getChapterContent, type BackendChapter, type ChapterContent } from "../data/api";
import { stories as fallbackStories } from "../data/stories";
import type { Story } from "../data/types";
import { NotFoundPage } from "./NotFoundPage";

export function ReaderPage() {
  const navigate = useNavigate();
  const { slug, chapter } = useParams();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState<number>(0);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);

    getStoryDetail(slug).then((detail) => {
      if (!active) return;
      if (!detail) {
        setStory(fallbackStories.find((s) => s.slug === slug) || null);
        setLoading(false);
        return;
      }

      setStory(detail.story);
      const chList = detail.chapters || [];
      setChapters(chList);

      // Find which chapter is requested
      let targetIdx = 0;
      if (chapter) {
        const found = chList.findIndex(
          (c, i) =>
            c.id === chapter ||
            String(c.chapter_index) === chapter ||
            String(i + 1) === chapter
        );
        if (found >= 0) targetIdx = found;
      }
      setActiveIdx(targetIdx);

      const targetChapter = chList[targetIdx];
      if (targetChapter) {
        getChapterContent(slug, targetChapter.id).then((cData) => {
          if (!active) return;
          setContent(cData);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [slug, chapter]);

  if (loading) {
    return (
      <div className="reader-page" style={{ padding: "48px 16px", textAlign: "center" }}>
        <p className="eyebrow">ĐANG TẢI</p>
        <h2>Đang tải nội dung chương...</h2>
      </div>
    );
  }

  if (!story) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const currentChapter = chapters[activeIdx];
  const chapterTitle = content?.title || currentChapter?.title || `Chương ${activeIdx + 1}`;
  const totalChapters = Math.max(chapters.length, story.chapters, 1);

  const prevChapter = activeIdx > 0 ? chapters[activeIdx - 1] : null;
  const nextChapter = activeIdx < chapters.length - 1 ? chapters[activeIdx + 1] : null;

  const prevLink = prevChapter ? `${path}/doc/${prevChapter.id || activeIdx}` : null;
  const nextLink = nextChapter ? `${path}/doc/${nextChapter.id || activeIdx + 2}` : null;
  const audioLink = `${path}/nghe/${currentChapter ? currentChapter.id : activeIdx + 1}`;

  return (
    <div className="reader-page">
      <nav className="reading-breadcrumb" aria-label="Đường dẫn">
        <Link to={path}>{story.title}</Link>
        <span aria-hidden="true">/</span>
        <span>{chapterTitle}</span>
      </nav>

      <header className="reader-heading">
        <p className="eyebrow">ĐỌC TRUYỆN</p>
        <h1>{chapterTitle}</h1>
        <p>
          {story.title} · {story.author}
        </p>
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "center" }}>
          <Link className="button button-primary" to={audioLink} style={{ fontSize: "13px", padding: "6px 16px" }}>
            🎧 Nghe Audio Chương Này
          </Link>
        </div>
      </header>

      <ReaderToolbar storyPath={path} />

      <nav className="reader-chapter-nav" aria-label="Điều hướng chương">
        {prevLink ? (
          <Link className="button" to={prevLink}>
            Chương trước
          </Link>
        ) : (
          <span />
        )}
        <label>
          Chọn chương{" "}
          <select
            aria-label="Chọn chương"
            value={activeIdx}
            onChange={(event) => {
              const idx = Number(event.target.value);
              const ch = chapters[idx];
              navigate(`${path}/doc/${ch ? ch.id : idx + 1}`);
            }}
          >
            {chapters.map((ch, idx) => (
              <option key={ch.id || idx} value={idx}>
                {ch.title || `Chương ${idx + 1}`}
              </option>
            ))}
          </select>
        </label>
        {nextLink ? (
          <Link className="button" to={nextLink}>
            Chương sau
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {content?.html ? (
        <article
          className="reader-article"
          dangerouslySetInnerHTML={{ __html: content.html }}
        />
      ) : (
        <article className="reader-article">
          <p>{story.description}</p>
          <p>Nội dung chương đang được cập nhật từ máy chủ...</p>
        </article>
      )}

      <nav className="reader-chapter-nav" aria-label="Điều hướng cuối chương">
        {prevLink && (
          <Link className="button" to={prevLink}>
            Chương trước
          </Link>
        )}
        {nextLink && (
          <Link className="button button-primary" to={nextLink}>
            Chương sau
          </Link>
        )}
        <a className="button" href="#main-content">
          Về đầu trang
        </a>
      </nav>
    </div>
  );
}
