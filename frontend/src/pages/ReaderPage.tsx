import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { ReaderToolbar } from "../components/ReaderToolbar";
import { TextLoader } from "../components/TextLoader";
import { MiniPlayer } from "../components/MiniPlayer";
import {
  getStoryDetail,
  getChapterContent,
  type BackendChapter,
  type ChapterContent,
  type ChapterCue,
} from "../data/api";
import { stories as fallbackStories } from "../data/stories";
import type { Story } from "../data/types";
import { NotFoundPage } from "./NotFoundPage";

export function ReaderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialAutoPlay = Boolean(location.state?.autoPlay);
  const { slug, chapter } = useParams();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const seekRef = useRef<((time: number) => void) | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setActiveCueId(null);

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

  const cues = content?.cues || [];

  function handleAudioTimeUpdate(cur: number) {
    if (!cues.length) return;
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const next = cues[i + 1];
      const nextStart = next ? next.start : c.end + 0.5;
      if (cur >= c.start && cur < Math.max(c.end, nextStart)) {
        if (c.id !== activeCueId) {
          setActiveCueId(c.id);
        }
        break;
      }
    }
  }

  useEffect(() => {
    if (!activeCueId) return;
    document.querySelectorAll(".reader-article .active-cue").forEach((el) => {
      el.classList.remove("active-cue");
    });
    const el = document.getElementById(activeCueId);
    if (el) {
      el.classList.add("active-cue");
      if (autoScroll) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeCueId, autoScroll]);

  function handleArticleClick(e: React.MouseEvent<HTMLElement>) {
    const target = (e.target as HTMLElement).closest("[data-start]") as HTMLElement | null;
    if (!target) return;
    const start = parseFloat(target.getAttribute("data-start") || "");
    if (!isNaN(start) && seekRef.current) {
      seekRef.current(start);
      setActiveCueId(target.id);
    }
  }

  function handleScrollToActiveCue() {
    if (activeCueId) {
      const el = document.getElementById(activeCueId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else if (seekRef.current && cues.length > 0) {
      seekRef.current(cues[0].start);
    }
  }

  if (loading) {
    return (
      <div className="reader-page">
        <TextLoader text="Đang nạp nội dung chương..." />
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
  const audioSrc =
    content?.audio_url ||
    (currentChapter ? `/api/books/${story.slug}/audio/${currentChapter.id}` : undefined);
  const activeCue = cues.find((c) => c.id === activeCueId) || null;

  return (
    <div className={`reader-page ${audioSrc ? "reader-page-with-player" : ""}`}>
      <nav className="reading-breadcrumb" aria-label="Đường dẫn">
        <Link to={path}>{story.title}</Link>
        <span aria-hidden="true">/</span>
        <span>{chapterTitle}</span>
      </nav>

      <header className="reader-heading">
        <p className="eyebrow">ĐỌC TRUYỆN & KARAOKE</p>
        <h1>{chapterTitle}</h1>
        <p>
          {story.title} · {story.author}
        </p>
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          {audioSrc && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                if (seekRef.current) {
                  const first = cues[0];
                  seekRef.current(first ? first.start : 0);
                }
              }}
              style={{ fontSize: "13px", padding: "6px 16px" }}
            >
              ✨ Nghe Audio & Karaoke Đồng Bộ
            </button>
          )}
          <Link className="button" to={audioLink} style={{ fontSize: "13px", padding: "6px 16px" }}>
            🎧 Mở Máy Đĩa Than
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
          onClick={handleArticleClick}
          dangerouslySetInnerHTML={{ __html: content.html }}
        />
      ) : cues.length > 0 ? (
        <article className="reader-article" onClick={handleArticleClick}>
          {cues.map((cue) => (
            <p
              key={cue.id}
              id={cue.id}
              data-start={cue.start}
              data-end={cue.end}
              className="reader-paragraph"
            >
              {cue.text}
            </p>
          ))}
        </article>
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

      {/* Sticky Mini Player for Synchronized Karaoke Audio */}
      {audioSrc && (
        <MiniPlayer
          storyTitle={story.title}
          chapterTitle={chapterTitle}
          audioSrc={audioSrc}
          cues={cues}
          activeCue={activeCue}
          onTimeUpdate={handleAudioTimeUpdate}
          seekRef={seekRef}
          prevLink={prevLink}
          nextLink={nextLink}
          audioPageLink={audioLink}
          autoScroll={autoScroll}
          onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
          onScrollToActiveCue={handleScrollToActiveCue}
          initialAutoPlay={initialAutoPlay}
          onEnded={() => {
            if (nextLink) navigate(nextLink, { state: { autoPlay: true } });
          }}
        />
      )}
    </div>
  );
}

