import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Tabs } from "../components/Tabs";
import { StoryGrid } from "../components/StoryGrid";
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
    .filter((item) => item.id !== story.id && item.category === story.category)
    .slice(0, 4);

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

  const bannerImage = story.banner || story.cover;

  return (
    <div className="story-page">
      <div className="story-detail-hero">
        {bannerImage && (
          <div className="story-hero-backdrop" aria-hidden="true">
            <img
              src={bannerImage}
              alt=""
              className="story-hero-backdrop-img"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="story-hero-backdrop-overlay" />
          </div>
        )}
        <div className="story-detail-cover">
          <img src={story.cover} alt={`Bìa truyện ${story.title}`} />
        </div>
        <div className="story-detail-intro">
          <p className="eyebrow">{story.category}</p>
          <h1>{story.title}</h1>
          <p className="story-detail-author">
            Tác giả: <strong>{story.author}</strong>
          </p>
          <div className="story-detail-stats">
            <span>{story.status === "completed" ? "Đã hoàn thành" : "Đang cập nhật"}</span>
            <span>{totalChaptersCount} chương</span>
            <span>{new Intl.NumberFormat("vi-VN").format(story.views)} lượt đọc</span>
            <span>{story.rating}/5 đánh giá</span>
          </div>
          <div className="story-detail-actions">
            {userProgress ? (
              <>
                <Link
                  className="button button-primary"
                  to={`${path}/doc/${userProgress.chapter_id}`}
                >
                  📖 Đọc tiếp ({userProgress.chapter_title || `Chương ${userProgress.chapter_id}`})
                </Link>
                {story.hasAudio && (
                  <Link
                    className="button"
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
                <Link className="button button-primary" to={`${path}/doc/${firstChapterId}`}>
                  Đọc từ đầu
                </Link>
                {story.hasAudio && (
                  <Link className="button" to={`${path}/nghe/${firstChapterId}`}>
                    Nghe truyện
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="story-detail-layout">
        <div className="story-detail-main">
          <Tabs
            label="Nội dung truyện"
            items={[
              {
                id: "info",
                label: "Thông tin",
                content: (
                  <>
                    <h2>Giới thiệu truyện</h2>
                    <p style={{ whiteSpace: "pre-line" }}>{story.description}</p>
                    <div className="story-tags">
                      {story.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <p className="story-rating">
                      Độc giả đánh giá <strong>{story.rating}/5</strong>
                    </p>
                  </>
                ),
              },
              {
                id: "chapters",
                label: "Chương",
                content: (
                  <>
                    <h2>Danh sách chương</h2>
                    <p>Chọn một chương để bắt đầu đọc nội dung.</p>
                    {chapterList(false)}
                  </>
                ),
              },
              {
                id: "audio",
                label: "Audio",
                content: (
                  <>
                    <h2>Danh sách audio</h2>
                    <p>Nghe giọng đọc AI đồng bộ theo từng chương.</p>
                    {chapterList(true)}
                  </>
                ),
              },
              {
                id: "comments",
                label: "Bình luận",
                content: (
                  <>
                    <h2>Bình luận độc giả</h2>
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
                      <p>Chưa có bình luận cho truyện này.</p>
                    )}
                  </>
                ),
              },
            ]}
          />
        </div>
        <aside className="story-detail-side">
          <div className="membership-callout">
            <p className="eyebrow">HỘI VIÊN</p>
            <h2>Thêm thời gian cho câu chuyện hay</h2>
            <p>Trải nghiệm đọc và nghe mượt mà không giới hạn.</p>
            <Link className="button" to="/hoi-vien">
              Xem gói hội viên
            </Link>
          </div>
          {recommendations.length > 0 && (
            <section className="story-recommendations">
              <h2>Có thể bạn thích</h2>
              <StoryGrid stories={recommendations} variant="compact" />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
