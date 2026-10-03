import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Tabs } from "../components/Tabs";
import { StoryCard } from "../components/StoryCard";
import { TextLoader } from "../components/TextLoader";
import { comments } from "../data/site";
import { stories as fallbackStories } from "../data/stories";
import { getStoryDetail, getStories, type BackendChapter } from "../data/api";
import type { Story } from "../data/types";
import { NotFoundPage } from "./NotFoundPage";
import { useAuth } from "../context/AuthContext";

export function StoryPage() {
  const { token } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<BackendChapter[]>([]);
  const [allStories, setAllStories] = useState<Story[]>(fallbackStories);
  const [loading, setLoading] = useState(true);
  const { slug } = useParams();
  const [userProgress, setUserProgress] = useState<{
    chapter_id: string;
    chapter_title: string;
    current_time: number;
  } | null>(null);

  useEffect(() => {
    setShowAll(false);
    if (!slug) return;
    let active = true;

    getStoryDetail(slug).then((detail) => {
      if (!active) return;
      if (detail) {
        setStory(detail.story);
        setChapters(detail.chapters);
      } else {
        const found = fallbackStories.find((s) => s.slug === slug);
        setStory(found || null);
      }
      setLoading(false);
    });

    getStories().then((list) => {
      if (active && list.length > 0) setAllStories(list);
    });

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!token || !slug) {
      setUserProgress(null);
      return;
    }
    fetch(`/api/user/history/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.chapter_id) {
          setUserProgress({
            chapter_id: data.chapter_id,
            chapter_title: data.chapter_title,
            current_time: data.current_time || 0,
          });
        }
      })
      .catch(() => {});
  }, [token, slug]);

  if (loading) {
    return (
      <div className="story-page">
        <TextLoader text="Đang tải thông tin truyện..." />
      </div>
    );
  }

  if (!story) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const recommendations = allStories
    .filter((item) => item.id !== story.id)
    .sort((a, b) => {
      if (a.category === story.category && b.category !== story.category) return -1;
      if (b.category === story.category && a.category !== story.category) return 1;
      return (b.views || 0) - (a.views || 0);
    })
    .slice(0, 6);

  const totalChaptersCount = Math.max(story.chapters, chapters.length);
  const displayedChapters = showAll ? chapters : chapters.slice(0, 24);

  const firstChapterId = chapters[0]?.id || "1";

  const chapterList = (audio: boolean) => (
    <>
      <ol className="chapter-list">
        {displayedChapters.map((ch, idx) => {
          const chNum = ch.chapter_index !== undefined ? ch.chapter_index : idx + 1;
          const chParam = ch.id || String(chNum);
          return (
            <li key={ch.id || idx}>
              <Link to={`${path}/${audio ? "nghe" : "doc"}/${chParam}`}>
                {ch.title || (ch.chapter_index === 0 ? "Giới Thiệu" : `Chương ${chNum}`)}
              </Link>
            </li>
          );
        })}
      </ol>
      {chapters.length > 24 && (
        <button
          className="button chapter-expand"
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Thu gọn danh sách" : `Xem tất cả ${chapters.length} chương`}
        </button>
      )}
    </>
  );

  const storyComments = comments.filter((comment) => comment.storyId === story.id);

  const bannerImage = story.banner || `/api/books/${story.slug}/banner` || story.cover;

  return (
    <div className="story-page story-page-custom-layout">
      {/* 1. Top Wide Hero Banner with Centered Story Title */}
      <div className="story-top-banner" aria-label={`Banner truyện ${story.title}`}>
        <img
          src={bannerImage}
          alt={`Banner ${story.title}`}
          className="story-top-banner-img"
          style={{ objectPosition: story.bannerPosition || "center 20%" }}
          onError={(e) => {
            if (e.currentTarget.src !== story.cover) {
              e.currentTarget.src = story.cover;
            }
          }}
        />
        <div className="story-top-banner-overlay" />
        <h1 className="story-top-banner-title">{story.title}</h1>
      </div>

      {/* 2. Main Story Detail Row: Left Cover Image + Right Tabs Info Box */}
      <div className="story-main-row">
        {/* Left Column: Cover Image & Quick Action Buttons */}
        <div className="story-cover-col">
          <div className="story-cover-box">
            <img src={story.cover} alt={`Bìa truyện ${story.title}`} />
          </div>
          <div className="story-cover-actions">
            {userProgress ? (
              <>
                <Link
                  className="button button-primary story-btn-read"
                  to={`${path}/doc/${userProgress.chapter_id}`}
                >
                  📖 Đọc tiếp ({userProgress.chapter_title || `Chương ${userProgress.chapter_id}`})
                </Link>
                {story.hasAudio && (
                  <Link
                    className="button story-btn-audio"
                    to={`${path}/nghe/${userProgress.chapter_id}`}
                    state={{ resumeTime: userProgress.current_time, autoPlay: true }}
                  >
                    🎧 Nghe tiếp ({userProgress.chapter_title || `Chương ${userProgress.chapter_id}`})
                  </Link>
                )}
                <Link className="button button-outline" to={`${path}/doc/${firstChapterId}`} title="Đọc lại từ đầu">
                  Đọc từ đầu
                </Link>
              </>
            ) : (
              <>
                <Link className="button button-primary story-btn-read" to={`${path}/doc/${firstChapterId}`}>
                  📖 Đọc từ đầu
                </Link>
                {story.hasAudio && (
                  <Link className="button story-btn-audio" to={`${path}/nghe/${firstChapterId}`}>
                    🎧 Nghe audio
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column: Dark Rounded Box with Tabs */}
        <div className="story-tabs-card">
          <Tabs
            label="Nội dung truyện"
            items={[
              {
                id: "info",
                label: "Thông tin",
                content: (
                  <div className="story-tab-info-content">
                    <h2 className="story-info-heading">Giới thiệu truyện</h2>
                    <p className="story-desc">
                      {story.description || `Bộ truyện ${story.title} của tác giả ${story.author}.`}
                    </p>
                    <div className="story-tags">
                      {story.tags && story.tags.length > 0
                        ? story.tags.map((tag) => <span key={tag}>{tag}</span>)
                        : <span key={story.category}>{story.category}</span>}
                    </div>
                    <p className="story-rating-row">
                      Độc giả đánh giá <strong className="rating-highlight">{story.rating || 4.8}/5</strong>
                    </p>
                    <div className="story-quick-meta">
                      <span>Tác giả: <strong>{story.author}</strong></span>
                      <span>Trạng thái: <strong>{story.status === "completed" ? "Hoàn thành" : "Đang ra"}</strong></span>
                      <span>Số chương: <strong>{totalChaptersCount}</strong></span>
                      <span>Lượt xem: <strong>{new Intl.NumberFormat("vi-VN").format(story.views)}</strong></span>
                    </div>
                  </div>
                ),
              },
              {
                id: "chapters",
                label: "Chương",
                content: (
                  <div className="story-tab-chapters-content">
                    <h2 className="story-info-heading">Danh sách chương</h2>
                    <p style={{ color: "var(--color-muted)" }}>Chọn một chương để bắt đầu đọc nội dung.</p>
                    {chapterList(false)}
                  </div>
                ),
              },
              {
                id: "audio",
                label: "Audio",
                content: (
                  <div className="story-tab-audio-content">
                    <h2 className="story-info-heading">Danh sách audio</h2>
                    <p style={{ color: "var(--color-muted)" }}>Nghe giọng đọc AI đồng bộ theo từng chương.</p>
                    {chapterList(true)}
                  </div>
                ),
              },
              {
                id: "comments",
                label: "Bình luận",
                content: (
                  <div className="story-tab-comments-content">
                    <h2 className="story-info-heading">Bình luận độc giả</h2>
                    {storyComments.length ? (
                      <div className="story-comments">
                        {storyComments.map((comment) => (
                          <blockquote key={comment.id}>
                            <p>{comment.content}</p>
                            <footer>{comment.author}</footer>
                          </blockquote>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: "var(--color-muted)" }}>Chưa có bình luận cho truyện này.</p>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* 3. Bottom Section: "Đề xuất cho bạn" (2-Column Grid) */}
      {recommendations.length > 0 && (
        <section className="story-recommendations-section" aria-label="Đề xuất cho bạn">
          <h2 className="story-recommendations-heading">Đề xuất cho bạn</h2>
          <div className="story-recommendations-grid">
            {recommendations.map((rec) => (
              <StoryCard key={rec.id} story={rec} variant="horizontal" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

