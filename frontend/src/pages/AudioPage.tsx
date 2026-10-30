import { useEffect, useState } from "react";
import { Link, useParams, useLocation, useSearchParams } from "react-router-dom";
import { AudioPlayer } from "../components/AudioPlayer";
import { AudioLoader } from "../components/AudioLoader";
import { VoiceSelector } from "../components/VoiceSelector";
import { getBestPlaybackProgress, getLocalPlaybackProgress } from "../data/playbackProgress";
import {
  getStoryDetail,
  getChapterContent,
  getCachedChapterContent,
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
  const localProg = slug ? getLocalPlaybackProgress(slug) : null;
  const [resumeTime, setResumeTime] = useState<number>(() => {
    if (typeof stateResumeTime === "number") return stateResumeTime;
    if (localProg && localProg.current_time > 0) return localProg.current_time;
    return 0;
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [slug, chapter, activeIdx]);

  useEffect(() => {
    if (typeof stateResumeTime === "number") {
      setResumeTime(stateResumeTime);
      return;
    }
    // Reset to 0 when changing chapters so it doesn't leak the previous chapter's time
    setResumeTime(0);

    if (!slug || chapters.length === 0) return;
    const currentCh = chapters[activeIdx];
    if (!currentCh) return;

    getBestPlaybackProgress(slug, token).then((best) => {
      if (!best) return;
      if (
        best.chapter_id === currentCh.id ||
        String(activeIdx + 1) === best.chapter_id ||
        String(currentCh.chapter_index) === best.chapter_id
      ) {
        if (best.current_time && best.current_time > 0) {
          setResumeTime(best.current_time);
        }
      }
    });
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
      } else {
        // Fallback: check saved local progress if user navigated without chapter in URL
        const saved = getLocalPlaybackProgress(slug);
        if (saved && saved.chapter_id) {
          let found = chList.findIndex((c) => c.id === saved.chapter_id);
          if (found < 0) {
            found = chList.findIndex((c) => c.chapter_index !== undefined && String(c.chapter_index) === saved.chapter_id);
          }
          if (found < 0) {
            found = chList.findIndex((_, i) => String(i + 1) === saved.chapter_id);
          }
          if (found >= 0) {
            targetIdx = found;
            if (saved.current_time && saved.current_time > 0) {
              setResumeTime(saved.current_time);
            }
          }
        }
      }
      setActiveIdx(targetIdx);

      const targetChapter = chList[targetIdx];
      if (targetChapter) {
        const cached = getCachedChapterContent(slug, targetChapter.id, selectedVoice || undefined);
        if (cached) {
          setContent(cached);
          if (cached?.current_voice && !selectedVoice) {
            setSelectedVoice(cached.current_voice);
          }
          setLoading(false);
        } else {
          setContent(null);
        }
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
  const isMatchingContent = Boolean(
    content &&
      currentChapter &&
      (content.chapter_id === currentChapter.id ||
        (currentChapter.chapter_index !== undefined && content.chapter_id === String(currentChapter.chapter_index)))
  );
  const chapterTitle =
    (isMatchingContent && content?.title) ||
    currentChapter?.title ||
    (currentChapter?.chapter_index === 0
      ? "Giới Thiệu"
      : currentChapter?.chapter_index !== undefined
      ? `Chương ${currentChapter.chapter_index}`
      : `Chương ${activeIdx + 1}`);
  const audioSrc =
    (isMatchingContent && content?.audio_url) ||
    (currentChapter ? `/api/books/${story.slug}/audio/${currentChapter.id}` : undefined);
  const docLink = `${path}/doc/${currentChapter ? currentChapter.id : activeIdx + 1}`;

  return (
    <div className="audio-page-container">
      {/* Immersive Ambient Glow from Story Cover */}
      <div
        className="audio-ambient-backdrop"
        style={{ backgroundImage: `url("${story.cover}")` }}
        aria-hidden="true"
      />

      {/* Top Header Bar */}
      <header className="audio-theater-header">
        <nav className="reading-breadcrumb" aria-label="Đường dẫn">
          <Link to="/">Trang chủ</Link>
          <span aria-hidden="true">/</span>
          <Link to={path}>{story.title}</Link>
          <span aria-hidden="true">/</span>
          <span>Nghe audio</span>
        </nav>

        {content?.available_voices && content.available_voices.length > 0 && (
          <div className="audio-header-voice">
            <VoiceSelector
              voices={content.available_voices}
              currentVoice={content.current_voice || selectedVoice}
              onSelectVoice={handleVoiceChange}
            />
          </div>
        )}
      </header>

      {/* Main 2-Column Audio Player Theater */}
      <AudioPlayer
        storyPath={path}
        chapterIndex={activeIdx}
        chapters={chapters}
        audioSrc={audioSrc}
        storyTitle={story.title}
        coverUrl={story.cover}
        initialAutoPlay={initialAutoPlay}
        initialTime={resumeTime}
        currentVoice={selectedVoice}
        chapterTitle={chapterTitle}
        docLink={docLink}
        author={story.author}
      />
    </div>
  );
}


