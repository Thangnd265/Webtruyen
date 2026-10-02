import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Carousel } from "../components/Carousel";
import { HomeRankings } from "../components/HomeRankings";
import { RatingFeed } from "../components/RatingFeed";
import { StoryGrid } from "../components/StoryGrid";
import { Icon } from "../components/Icon";
import { filterStories } from "../data/catalog";
import { getStories, buildDynamicHeroSlides } from "../data/api";
import { heroSlides as fallbackSlides } from "../data/site";
import { stories as fallbackStories } from "../data/stories";
import type { HeroSlide, Story } from "../data/types";
import { useAuth } from "../context/AuthContext";

interface HistoryItem {
  book_slug: string;
  book_title: string;
  book_author?: string;
  book_cover?: string;
  chapter_id: string;
  chapter_title: string;
  current_time?: number;
  duration?: number;
  progress?: number;
  updated_at?: string;
}

export function HomePage() {
  const { user, token } = useAuth();
  const [stories, setStories] = useState<Story[]>(fallbackStories);
  const [slides, setSlides] = useState<HeroSlide[]>(fallbackSlides);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [updatePage, setUpdatePage] = useState(1);

  const pageSize = 8;
  const newStories = useMemo(() => filterStories(stories, { sort: "new" }), [stories]);
  const totalUpdatePages = Math.max(1, Math.ceil(newStories.length / pageSize));
  const displayedUpdateStories = useMemo(() => {
    const start = (updatePage - 1) * pageSize;
    return newStories.slice(start, start + pageSize);
  }, [newStories, updatePage, pageSize]);

  useEffect(() => {
    let active = true;
    getStories().then((list) => {
      if (active && list.length > 0) {
        setStories(list);
        setSlides(buildDynamicHeroSlides(list));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setHistoryItems([]);
      return;
    }
    let active = true;
    fetch("/api/user/history?limit=4", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (active && Array.isArray(data)) {
          setHistoryItems(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="home-page">
      <h1 className="sr-only">Trang chủ Người Yêu Cũ</h1>
      <Carousel slides={slides} stories={stories} />

      <div className="home-container">
        {user && historyItems.length > 0 && (
          <section className="discovery-section user-continue-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DÀNH RIÊNG CHO BẠN ({user.display_name})</p>
                <h2>Tiếp tục nghe & đọc</h2>
              </div>
            </div>
            <div className="continue-reading-grid">
              {historyItems.map((item) => {
                const percent = Math.min(100, Math.round((item.progress || 0) * 100));
                return (
                  <div key={`${item.book_slug}-${item.chapter_id}`} className="continue-card">
                    {item.book_cover && (
                      <img
                        src={item.book_cover}
                        alt={item.book_title}
                        className="continue-card-cover"
                      />
                    )}
                    <div className="continue-card-details">
                      <h4 className="continue-card-title">{item.book_title}</h4>
                      <p className="continue-card-chapter">{item.chapter_title}</p>
                      {percent > 0 && (
                        <div className="continue-card-progress-bar">
                          <div
                            className="continue-card-progress-fill"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                      <div className="continue-card-actions">
                        <Link
                          to={`/truyen/${item.book_slug}/nghe/${item.chapter_id}`}
                          state={{ resumeTime: item.current_time || 0, autoPlay: true }}
                          className="continue-card-btn"
                        >
                          🎧 Nghe tiếp
                        </Link>
                        <Link
                          to={`/truyen/${item.book_slug}/doc/${item.chapter_id}`}
                          className="continue-card-btn"
                        >
                          📖 Đọc tiếp
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="discovery-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NGHE MỌI LÚC</p>
              <h2>Truyện audio</h2>
            </div>
            <Link to="/truyen/audio">Xem tất cả</Link>
          </div>
          <StoryGrid stories={filterStories(stories, { audioOnly: true }).slice(0, 4)} variant="horizontal" />
        </section>

        {/* Section MỚI CẬP NHẬT & BẢNG XẾP HẠNG TRUYỆN (Split layout matching user screenshot) */}
        <section className="home-split-section">
          <div className="home-split-main">
            <div className="section-heading-split">
              <div>
                <h2 className="split-title">Mới cập nhật</h2>
                <p className="split-subtitle">Những truyện vừa được cập nhật chương mới</p>
              </div>
              <div className="split-controls">
                <div className="split-pagination">
                  <button
                    type="button"
                    onClick={() => setUpdatePage((p) => Math.max(1, p - 1))}
                    disabled={updatePage === 1}
                    aria-label="Trang trước"
                    className="split-page-btn"
                  >
                    <Icon icon={ChevronLeft} size={16} />
                  </button>
                  <span className="split-page-indicator">{updatePage} / {totalUpdatePages}</span>
                  <button
                    type="button"
                    onClick={() => setUpdatePage((p) => Math.min(totalUpdatePages, p + 1))}
                    disabled={updatePage >= totalUpdatePages}
                    aria-label="Trang sau"
                    className="split-page-btn"
                  >
                    <Icon icon={ChevronRight} size={16} />
                  </button>
                </div>
                <Link to="/truyen?sort=new" className="split-view-all">
                  Xem tất cả &rarr;
                </Link>
              </div>
            </div>
            <StoryGrid stories={displayedUpdateStories} variant="poster" />
          </div>

          <aside className="home-rankings-aside">
            <HomeRankings stories={stories} />
          </aside>
        </section>

        <section className="discovery-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TUYỂN CHỌN</p>
              <h2>Biên tập đề cử</h2>
            </div>
            <Link to="/truyen">Khám phá</Link>
          </div>
          <StoryGrid stories={stories.slice(0, 4)} variant="horizontal" />
        </section>

        <section className="discovery-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GÓC ĐỘC GIẢ</p>
              <h2>Đánh giá mới</h2>
            </div>
          </div>
          <RatingFeed />
        </section>
      </div>
    </div>
  );
}
