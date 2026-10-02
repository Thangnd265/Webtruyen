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

export function AudioPage() {
  const { slug, chapter } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVoice = searchParams.get("voice") || localStorage.getItem("webtruyen_voice_pref") || "";
  const initialAutoPlay = Boolean(location.state?.autoPlay);
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [content, setContent] = useState<ChapterContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoice);

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


