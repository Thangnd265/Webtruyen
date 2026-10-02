import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { ReaderToolbar } from "../components/ReaderToolbar";
import { TextLoader } from "../components/TextLoader";
import { MiniPlayer } from "../components/MiniPlayer";
import { VoiceSelector } from "../components/VoiceSelector";
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
import { useAuth } from "../context/AuthContext";

export function ReaderPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialAutoPlay = Boolean(location.state?.autoPlay);
  const stateResumeTime = location.state?.resumeTime;
  const { slug, chapter } = useParams();
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    return localStorage.getItem("webtruyen_voice_pref") || "";
  });
  const [resumeTime, setResumeTime] = useState<number>(() => {
    return typeof stateResumeTime === "number" ? stateResumeTime : 0;
  });
  const seekRef = useRef<((time: number) => void) | null>(null);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    if (!story || story.slug !== slug) {
      setLoading(true);
    }
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

      // Find which chapter is requested: Ưu tiên id -> chapter_index -> fallback thứ tự mảng
      let targetIdx = 0;
      if (chapter) {
        let found = chList.findIndex((c) => c.id === chapter);
        if (found < 0) {
          found = chList.findIndex((c) => c.chapter_index !== undefined && String(c.chapter_index) === chapter);
        }
        if (found < 0) {
          found = chList.findIndex((_, i) => String(i + 1) === chapter);
        }
        if (found >= 0) targetIdx = found;
      }
      setActiveIdx(targetIdx);

      const targetChapter = chList[targetIdx];
      if (targetChapter) {
        getChapterContent(slug, targetChapter.id, selectedVoice || undefined).then((cData) => {
          if (!active) return;
          setContent(cData);
          if (cData?.current_voice && !selectedVoice) {
            setSelectedVoice(cData.current_voice);
          }
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

  useEffect(() => {
    if (typeof stateResumeTime === "number") {
      setResumeTime(stateResumeTime);
      return;
    }
    setResumeTime(0);
    if (!token || !slug || chapters.length === 0) return;
    const currentCh = chapters[activeIdx];
    if (!currentCh) return;

    fetch(`/api/user/history/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((hist) => {
        if (!hist) return;
        if (
          hist.chapter_id === currentCh.id ||
          String(activeIdx + 1) === hist.chapter_id ||
          String(currentCh.chapter_index) === hist.chapter_id
        ) {
          if (hist.current_time && hist.current_time > 0) {
            setResumeTime(hist.current_time);
          }
        }
      })
      .catch(() => {});
  }, [token, slug, activeIdx, chapters, stateResumeTime]);

  useEffect(() => {
    if (!token || !slug || !story || !chapters[activeIdx]) return;
    const ch = chapters[activeIdx];
    fetch("/api/user/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_slug: slug,
        book_title: story.title || slug,
        book_author: story.author || "",
        book_cover: story.cover || "",
        chapter_id: ch.id,
        chapter_title: ch.title || `Chương ${activeIdx + 1}`,
        current_time: 0,
        duration: 0,
        progress: Number(((activeIdx + 1) / Math.max(chapters.length, 1)).toFixed(4)),
      }),
    }).catch(() => {});
  }, [token, slug, activeIdx, story, chapters]);

  function handleVoiceChange(voiceId: string) {
    setSelectedVoice(voiceId);
    localStorage.setItem("webtruyen_voice_pref", voiceId);
    const targetChapter = chapters[activeIdx];
    if (slug && targetChapter) {
      getChapterContent(slug, targetChapter.id, voiceId).then((cData) => {
        if (cData) {
          setContent(cData);
        }
      });
    }
  }

  const cues = content?.cues || [];

  function handleAudioTimeUpdate(cur: number, dur: number = 0) {
    if (cues.length) {
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

    if (!token || !slug || !story || !chapters[activeIdx]) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 10000) return;
    lastSyncRef.current = now;

    const ch = chapters[activeIdx];
    fetch("/api/user/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_slug: slug,
        book_title: story.title || slug,
        book_author: story.author || "",
        book_cover: story.cover || "",
        chapter_id: ch.id,
        chapter_title: ch.title || `Chương ${activeIdx + 1}`,
        current_time: cur,
        duration: dur,
        progress: dur > 0 ? Number((cur / dur).toFixed(4)) : Number(((activeIdx + 1) / Math.max(chapters.length, 1)).toFixed(4)),
      }),
    }).catch(() => {});
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
  const chapterTitle =
    content?.title ||
    currentChapter?.title ||
    (currentChapter?.chapter_index === 0
      ? "Giới Thiệu"
      : currentChapter?.chapter_index !== undefined
      ? `Chương ${currentChapter.chapter_index}`
      : `Chương ${activeIdx + 1}`);
  const totalChapters = Math.max(chapters.length, story.chapters, 1);

  const prevChapter = activeIdx > 0 ? chapters[activeIdx - 1] : null;
  const nextChapter = activeIdx < chapters.length - 1 ? chapters[activeIdx + 1] : null;

  const prevLink = prevChapter ? `${path}/doc/${prevChapter.id || activeIdx}` : null;
  const nextLink = nextChapter ? `${path}/doc/${nextChapter.id || activeIdx + 2}` : null;
  const audioLink = `${path}/nghe/${currentChapter ? currentChapter.id : activeIdx + 1}${selectedVoice ? `?voice=${selectedVoice}` : ""}`;
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

        {content?.available_voices && content.available_voices.length > 0 && (
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
            <VoiceSelector
              voices={content.available_voices}
              currentVoice={content.current_voice || selectedVoice}
              onSelectVoice={handleVoiceChange}
            />
          </div>
        )}
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
                {ch.title || (ch.chapter_index === 0 ? "Giới Thiệu" : `Chương ${ch.chapter_index ?? idx + 1}`)}
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
          initialTime={resumeTime}
          onEnded={() => {
            if (nextLink) navigate(nextLink, { state: { autoPlay: true } });
          }}
        />
      )}
    </div>
  );
}

