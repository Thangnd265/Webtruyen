import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Carousel } from "../components/Carousel";
import { RankingList } from "../components/RankingList";
import { RatingFeed } from "../components/RatingFeed";
import { StoryGrid } from "../components/StoryGrid";
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
      <div className="home-layout">
        <div className="home-content">
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
          <section className="discovery-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">VỪA LÊN KỆ</p>
                <h2>Mới cập nhật</h2>
              </div>
              <Link to="/truyen?sort=new">Xem tất cả</Link>
            </div>
            <StoryGrid stories={filterStories(stories, { sort: "new" }).slice(0, 8)} />
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
        <aside className="home-sidebar">
          <h2>Bảng xếp hạng</h2>
          <RankingList />
          <Link className="sidebar-link" to="/bang-xep-hang">Xem bảng xếp hạng</Link>
        </aside>
      </div>
    </div>
  );
}
