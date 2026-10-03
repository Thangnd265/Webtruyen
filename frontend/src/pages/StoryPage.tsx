import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpDown, BookOpen, ChevronLeft, ChevronRight, Headphones, Info, List, Search } from "lucide-react";
import { Icon } from "../components/Icon";
import { Tabs } from "../components/Tabs";
import { StoryCard } from "../components/StoryCard";
import { TextLoader } from "../components/TextLoader";
import { stories as fallbackStories } from "../data/stories";
import { getStoryDetail, getStories, type BackendChapter } from "../data/api";
import type { Story } from "../data/types";
import { NotFoundPage } from "./NotFoundPage";
import { useAuth } from "../context/AuthContext";

const CHAPTERS_PER_PAGE = 30;

function getPaginationPages(current: number, total: number): (number | string)[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [];
  if (current <= 3) {
    pages.push(1, 2, 3, 4, "...", total);
  } else if (current >= total - 2) {
    pages.push(1, "...", total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", total);
  }
  return pages;
}

export function StoryPage() {
  const { token } = useAuth();
  const [chapterPage, setChapterPage] = useState(1);
  const [audioPage, setAudioPage] = useState(1);
  const [chapterSortAsc, setChapterSortAsc] = useState(true);
  const [chapterSearch, setChapterSearch] = useState("");
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
    setChapterPage(1);
    setAudioPage(1);
    setChapterSearch("");
    setChapterSortAsc(true);
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

  // Separate intro/TOC chapters from regular chapters starting from Chapter 1
  const { introChapters, regularChapters } = useMemo(() => {
    const intros: BackendChapter[] = [];
    const regular: BackendChapter[] = [];
    let foundFirstRegular = false;

    for (const c of chapters) {
      if (foundFirstRegular) {
        regular.push(c);
        continue;
      }
      const titleLower = (c.title || "").toLowerCase().trim();
      const idx = c.chapter_index;
      if (
        idx === 0 ||
        titleLower.includes("mục lục") ||
        titleLower.includes("giới thiệu") ||
        !titleLower.startsWith("chương")
      ) {
        intros.push(c);
      } else {
        foundFirstRegular = true;
        regular.push(c);
      }
    }
    return {
      introChapters: intros,
      regularChapters: regular.length > 0 ? regular : chapters,
    };
  }, [chapters]);

  const sortedAndFilteredChapters = useMemo(() => {
    let list = [...regularChapters];
    if (!chapterSortAsc) {
      list.reverse();
    }
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase().trim();
      list = list.filter((ch, idx) => {
        const chNum = ch.chapter_index !== undefined ? ch.chapter_index : idx + 1;
        const title = (ch.title || `Chương ${chNum}`).toLowerCase();
        return title.includes(q) || String(chNum).includes(q);
      });
    }
    return list;
  }, [regularChapters, chapterSortAsc, chapterSearch]);

  const audioChaptersCount = useMemo(
    () => regularChapters.filter((c) => Boolean(c.has_audio)).length,
    [regularChapters]
  );

  const firstAudioChapter = useMemo(
    () => regularChapters.find((c) => Boolean(c.has_audio)) || chapters.find((c) => Boolean(c.has_audio)),
    [regularChapters, chapters]
  );

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

  const totalChaptersCount = Math.max(story.chapters, regularChapters.length);

  const chapterList = (audio: boolean) => {
    const totalPages = Math.max(1, Math.ceil(sortedAndFilteredChapters.length / CHAPTERS_PER_PAGE));
    const currentPage = audio ? Math.min(audioPage, totalPages) : Math.min(chapterPage, totalPages);
    const startIndex = (currentPage - 1) * CHAPTERS_PER_PAGE;
    const displayedChapters = sortedAndFilteredChapters.slice(startIndex, startIndex + CHAPTERS_PER_PAGE);

    return (
      <div className="story-chapter-section">
        <div className="chapter-toolbar">
          <div className="chapter-toolbar-left">
            <span className="chapter-count-badge">
              {audio
                ? `Audio: ${audioChaptersCount} chương`
                : `Tổng số: ${regularChapters.length} chương`}
            </span>
            {totalPages > 1 && (
              <span className="chapter-page-badge">
                Trang {currentPage}/{totalPages}
              </span>
            )}
          </div>
          <div className="chapter-toolbar-right">
            <div className="chapter-search-box">
              <Icon icon={Search} className="chapter-search-icon" />
              <input
                type="text"
                placeholder="Tìm số hoặc tên chương..."
                value={chapterSearch}
                onChange={(e) => {
                  setChapterSearch(e.target.value);
                  setChapterPage(1);
                  setAudioPage(1);
                }}
                className="chapter-search-input"
                aria-label="Tìm kiếm chương"
              />
            </div>
            <button
              type="button"
              className="chapter-sort-btn"
              onClick={() => {
                setChapterSortAsc(!chapterSortAsc);
                setChapterPage(1);
                setAudioPage(1);
              }}
              title={chapterSortAsc ? "Sắp xếp: Cũ nhất trước (Bấm để đảo)" : "Sắp xếp: Mới nhất trước (Bấm để đảo)"}
            >
              <Icon icon={ArrowUpDown} />
              <span>{chapterSortAsc ? "Cũ nhất" : "Mới nhất"}</span>
            </button>
          </div>
        </div>

        {displayedChapters.length === 0 ? (
          <div className="chapter-empty-state">
            <p>Không tìm thấy chương nào phù hợp với &quot;{chapterSearch}&quot;</p>
          </div>
        ) : (
          <ol className="chapter-list">
            {displayedChapters.map((ch, idx) => {
              const chNum = ch.chapter_index !== undefined ? ch.chapter_index : idx + 1;
              const chParam = ch.id || String(chNum);
              const title = ch.title || (ch.chapter_index === 0 ? "Giới Thiệu" : `Chương ${chNum}`);
              const hasAudio = Boolean(ch.has_audio);

              // In Audio tab: chapters without audio cannot be clicked and don't show the audio badge
              if (audio && !hasAudio) {
                return (
                  <li key={ch.id || idx}>
                    <div
                      className="chapter-item-link chapter-item-disabled"
                      title="Chương này chưa có bản thu Audio"
                      aria-disabled="true"
                    >
                      <span className="chapter-item-title">{title}</span>
                    </div>
                  </li>
                );
              }

              // Clickable chapter link
              return (
                <li key={ch.id || idx}>
                  <Link
                    to={`${path}/${audio ? "nghe" : "doc"}/${chParam}`}
                    className="chapter-item-link"
                    title={title}
                  >
                    <span className="chapter-item-title">{title}</span>
                    {hasAudio && <span className="chapter-item-badge">🎧 Audio</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {totalPages > 1 && (
          <nav className="chapter-pagination" aria-label="Phân trang chương">
            <button
              type="button"
              className="chapter-page-nav-btn"
              disabled={currentPage <= 1}
              onClick={() => (audio ? setAudioPage(currentPage - 1) : setChapterPage(currentPage - 1))}
              aria-label="Trang trước"
            >
              <Icon icon={ChevronLeft} size={16} />
            </button>

            <div className="chapter-page-numbers">
              {getPaginationPages(currentPage, totalPages).map((p, idx) =>
                typeof p === "number" ? (
                  <button
                    key={`page-${p}`}
                    type="button"
                    className={`chapter-page-btn ${currentPage === p ? "active" : ""}`}
                    onClick={() => (audio ? setAudioPage(p) : setChapterPage(p))}
                    aria-current={currentPage === p ? "page" : undefined}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`ellipsis-${idx}`} className="chapter-page-ellipsis">
                    {p}
                  </span>
                )
              )}
            </div>

            <button
              type="button"
              className="chapter-page-nav-btn"
              disabled={currentPage >= totalPages}
              onClick={() => (audio ? setAudioPage(currentPage + 1) : setChapterPage(currentPage + 1))}
              aria-label="Trang tiếp"
            >
              <Icon icon={ChevronRight} size={16} />
            </button>
          </nav>
        )}
      </div>
    );
  };

  const bannerImage =
    story.banner ||
    (story.cover?.includes("unsplash.com") ? story.cover.replace("w=480", "w=1600") : "") ||
    `/api/books/${story.slug}/banner` ||
    story.cover;

  return (
    <div className="story-page story-page-custom-layout">
      {/* Dynamic Ambient Background matching the story's banner */}
      <div className="story-ambient-backdrop" aria-hidden="true">
        <div
          className="story-ambient-glow"
          style={{ backgroundImage: `url("${bannerImage}")` }}
        />
        <div className="story-ambient-overlay" />
        <div className="story-ambient-noise" />
      </div>

      {/* 1. Top Wide Hero Banner with Centered Story Title (Full-bleed like HomePage) */}
      <div className="story-top-banner story-top-banner-full-bleed" aria-label={`Banner truyện ${story.title}`}>
        <img
          src={bannerImage}
          alt={`Banner ${story.title}`}
          className="story-top-banner-img"
          style={{ objectPosition: story.bannerPosition || "center 20%" }}
          onError={(e) => {
            const fallback = story.cover?.includes("unsplash.com")
              ? story.cover.replace("w=480", "w=1600")
              : story.cover;
            if (e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback;
            }
          }}
        />
        <div className="story-top-banner-overlay" />
        <div className="story-top-banner-content">
          <h1 className="story-top-banner-title">{story.title}</h1>
        </div>
      </div>

      <div className="story-content-container">
        {/* 2. Upper Box: Story Detail Info Box (Cover on Left, Full Info on Right) */}
        <div className="story-unified-card story-detail-info-card">
          {/* Left Column: Book Cover */}
          <div className="story-unified-cover">
            <img src={story.cover} alt={`Bìa truyện ${story.title}`} />
          </div>

          {/* Right Column: Information & Actions */}
          <div className="story-unified-content">
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
            <div className="story-info-actions">
              <Link
                to={`${path}/doc/${userProgress?.chapter_id || regularChapters[0]?.id || chapters[0]?.id || "1"}`}
                className="story-action-btn story-action-btn-primary"
              >
                <Icon icon={BookOpen} size={16} />
                <span>{userProgress ? "Đọc tiếp" : "Đọc từ đầu"}</span>
              </Link>
              {firstAudioChapter && (
                <Link
                  to={`${path}/nghe/${(userProgress && chapters.find((c) => c.id === userProgress.chapter_id)?.has_audio ? userProgress.chapter_id : null) || firstAudioChapter.id}`}
                  className="story-action-btn story-action-btn-secondary"
                >
                  <Icon icon={Headphones} size={16} />
                  <span>Nghe Audio</span>
                </Link>
              )}
              {introChapters.map((intro) => {
                const titleLower = (intro.title || "").toLowerCase();
                const isToc = titleLower.includes("mục lục");
                const label = isToc
                  ? "Mục lục"
                  : titleLower.includes("giới thiệu")
                  ? "Giới thiệu"
                  : intro.title && intro.title.length <= 20
                  ? intro.title
                  : "Giới thiệu";
                return (
                  <Link
                    key={intro.id}
                    to={`${path}/doc/${intro.id}`}
                    className="story-action-btn story-action-btn-secondary story-action-btn-intro"
                    title={`Đọc ${intro.title || label}`}
                  >
                    <Icon icon={isToc ? List : Info} size={16} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Lower Box: Dedicated Chapters & Audio Box (30 chapters/page) */}
        <div className="story-chapters-card">
          <Tabs
            label="Danh sách chương và audio"
            items={[
              {
                id: "chapters",
                label: "Chương",
                content: (
                  <div className="story-tab-chapters-content">
                    {chapterList(false)}
                  </div>
                ),
              },
              {
                id: "audio",
                label: "Audio",
                content: (
                  <div className="story-tab-audio-content">
                    {chapterList(true)}
                  </div>
                ),
              },
            ]}
          />
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
    </div>
  );
}

