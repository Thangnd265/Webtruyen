import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AudioPlayer } from "../components/AudioPlayer";
import { AudioLoader } from "../components/AudioLoader";
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

export function AudioPage() {
  const { slug, chapter } = useParams();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const seekRef = useRef<((time: number) => void) | null>(null);

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

  function handleAudioTimeUpdate(cur: number) {
    const cues = content?.cues || [];
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
    document.querySelectorAll(".audio-karaoke-scrollbox .active-cue").forEach((el) => {
      el.classList.remove("active-cue");
    });
    const el = document.getElementById(`audio-cue-${activeCueId}`);
    if (el) {
      el.classList.add("active-cue");
      if (autoScroll) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeCueId, autoScroll]);

  function handleCueClick(cue: ChapterCue) {
    if (seekRef.current) {
      seekRef.current(cue.start);
      setActiveCueId(cue.id);
    }
  }

  if (loading) {
    return (
      <div className="audio-page">
        <AudioLoader text="Đang tải dữ liệu audio..." />
      </div>
    );
  }

  if (!story) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const currentChapter = chapters[activeIdx];
  const chapterTitle = content?.title || currentChapter?.title || `Chương ${activeIdx + 1}`;
  const audioSrc =
    content?.audio_url ||
    (currentChapter ? `/api/books/${story.slug}/audio/${currentChapter.id}` : undefined);
  const docLink = `${path}/doc/${currentChapter ? currentChapter.id : activeIdx + 1}`;

  return (
    <div className="audio-page">
      <nav className="reading-breadcrumb" aria-label="Đường dẫn">
        <Link to={path}>{story.title}</Link>
        <span aria-hidden="true">/</span>
        <span>Nghe truyện</span>
      </nav>

      <div className="audio-layout">
        <div className="audio-art">
          <img src={story.cover} alt={`Bìa truyện ${story.title}`} />
        </div>
        <div className="audio-content">
          <p className="eyebrow">AUDIO ĐỒNG BỘ</p>
          <h1>{chapterTitle}</h1>
          <p>
            {story.title} · {story.author}
          </p>

          <AudioPlayer
            storyPath={path}
            chapterIndex={activeIdx}
            chapters={chapters}
            audioSrc={audioSrc}
            cues={content?.cues}
            onTimeUpdate={handleAudioTimeUpdate}
            seekRef={seekRef}
          />

          <div style={{ marginTop: "16px" }}>
            <Link className="button" to={docLink}>
              📖 Đọc chương này dạng chữ
            </Link>
          </div>
        </div>
      </div>

      {/* Synchronized Chapter Lyrics / Karaoke Section */}
      {content?.cues && content.cues.length > 0 && (
        <section
          id="audio-karaoke-lyrics"
          className="audio-karaoke-section"
          aria-label="Lời thoại Karaoke đồng bộ"
        >
          <div className="audio-karaoke-header">
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>
                ✨ Lời Thoại Karaoke Đồng Bộ ({content.cues.length} câu)
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--color-muted)" }}>
                Nhấp vào câu bất kỳ để nghe âm thanh ngay từ câu đó
              </p>
            </div>
            <button
              type="button"
              className={`mini-action-btn ${autoScroll ? "active" : ""}`}
              onClick={() => setAutoScroll((prev) => !prev)}
            >
              {autoScroll ? "Tự động cuộn: Bật" : "Tự động cuộn: Tắt"}
            </button>
          </div>

          <div className="audio-karaoke-scrollbox">
            {content.cues.map((cue) => (
              <p
                key={cue.id}
                id={`audio-cue-${cue.id}`}
                data-start={cue.start}
                data-end={cue.end}
                className="reader-paragraph"
                onClick={() => handleCueClick(cue)}
              >
                {cue.text}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

