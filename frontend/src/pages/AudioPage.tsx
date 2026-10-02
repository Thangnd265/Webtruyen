import { useEffect, useState } from "react";
import { Link, useParams, useLocation, useSearchParams } from "react-router-dom";
import { AudioPlayer } from "../components/AudioPlayer";
import { AudioLoader } from "../components/AudioLoader";
import { VoiceSelector } from "../components/VoiceSelector";
import {
  getStoryDetail,
  getChapterContent,
  type BackendChapter,
  type ChapterContent,
} from "../data/api";
import { stories as fallbackStories } from "../data/stories";
import type { Story } from "../data/types";
import { NotFoundPage } from "./NotFoundPage";
import { useAuth } from "../context/AuthContext";

export function AudioPage() {
  const { slug, chapter } = useParams();
  const location = useLocation();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVoice = searchParams.get("voice") || localStorage.getItem("webtruyen_voice_pref") || "";
  const initialAutoPlay = Boolean(location.state?.autoPlay);
  const stateResumeTime = location.state?.resumeTime;
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoice);
  const [resumeTime, setResumeTime] = useState<number>(() => {
    return typeof stateResumeTime === "number" ? stateResumeTime : 0;
  });

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
    if (!slug) return;
    let active = true;
    if (!story || story.slug !== slug) {
      setLoading(true);
    }

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

  function handleVoiceChange(voiceId: string) {
    setSelectedVoice(voiceId);
    localStorage.setItem("webtruyen_voice_pref", voiceId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("voice", voiceId);
      return next;
    });
    const targetChapter = chapters[activeIdx];
    if (slug && targetChapter) {
      getChapterContent(slug, targetChapter.id, voiceId).then((cData) => {
        if (cData) {
          setContent(cData);
        }
      });
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
  const chapterTitle =
    content?.title ||
    currentChapter?.title ||
    (currentChapter?.chapter_index === 0
      ? "Giới Thiệu"
      : currentChapter?.chapter_index !== undefined
      ? `Chương ${currentChapter.chapter_index}`
      : `Chương ${activeIdx + 1}`);
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
          <p className="eyebrow">MÁY ĐĨA THAN AUDIO</p>
          <h1>{chapterTitle}</h1>
          <p>
            {story.title} · {story.author}
          </p>

          {content?.available_voices && content.available_voices.length > 0 && (
            <div style={{ margin: "16px 0" }}>
              <VoiceSelector
                voices={content.available_voices}
                currentVoice={content.current_voice || selectedVoice}
                onSelectVoice={handleVoiceChange}
              />
            </div>
          )}

          <AudioPlayer
            storyPath={path}
            chapterIndex={activeIdx}
            chapters={chapters}
            audioSrc={audioSrc}
            storyTitle={story.title}
            coverUrl={story.cover}
            initialAutoPlay={initialAutoPlay}
            initialTime={resumeTime}
          />

          <div style={{ marginTop: "16px" }}>
            <Link className="button" to={docLink}>
              📖 Đọc chương này dạng chữ (Kèm Karaoke)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


