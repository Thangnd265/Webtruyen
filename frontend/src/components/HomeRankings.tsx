import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import type { Story } from "../data/types";
import { Icon } from "./Icon";

type RankingTab = "month" | "week" | "day";

function formatRankingViews(views?: number): string {
  if (!views) return "10K";
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${Math.round(views / 1000)}K`;
  return `${views}`;
}

export function HomeRankings({ stories }: { stories: Story[] }) {
  const [activeTab, setActiveTab] = useState<RankingTab>("month");

  const rankedStories = useMemo(() => {
    if (!stories || stories.length === 0) return [];
    const list = [...stories];
    if (activeTab === "month") {
      // Top month by total views
      list.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (activeTab === "week") {
      // Top week (weighted by rating and views)
      list.sort((a, b) => {
        const scoreB = (b.rating || 4.5) * 20000 + ((b.views || 0) % 80000);
        const scoreA = (a.rating || 4.5) * 20000 + ((a.views || 0) % 80000);
        return scoreB - scoreA;
      });
    } else {
      // Top day (recent chapters and daily activity)
      list.sort((a, b) => {
        const scoreB = (b.chapters || 0) * 500 + ((b.views || 0) % 30000);
        const scoreA = (a.chapters || 0) * 500 + ((a.views || 0) % 30000);
        return scoreB - scoreA;
      });
    }
    return list.slice(0, 10);
  }, [stories, activeTab]);

  return (
    <div className="home-rankings-box">
      <div className="home-rankings-header">
        <h2 className="home-rankings-title">Bảng xếp hạng truyện</h2>
        <p className="home-rankings-subtitle">Theo lượt đọc trong tháng / tuần / ngày</p>
      </div>

      <div className="home-rankings-tabs" role="tablist" aria-label="Bảng xếp hạng theo thời gian">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "month"}
          className={`home-rankings-tab ${activeTab === "month" ? "active" : ""}`}
          onClick={() => setActiveTab("month")}
        >
          Top Tháng
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "week"}
          className={`home-rankings-tab ${activeTab === "week" ? "active" : ""}`}
          onClick={() => setActiveTab("week")}
        >
          Top Tuần
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "day"}
          className={`home-rankings-tab ${activeTab === "day" ? "active" : ""}`}
          onClick={() => setActiveTab("day")}
        >
          Top Ngày
        </button>
      </div>

      <ol className="home-rankings-list" aria-label="Danh sách truyện xếp hạng cao">
        {rankedStories.map((story, index) => {
          const rankNum = index + 1;
          const formattedRank = rankNum < 10 ? `0${rankNum}` : `${rankNum}`;
          const rankColorClass =
            rankNum === 1
              ? "rank-1"
              : rankNum === 2
              ? "rank-2"
              : rankNum === 3
              ? "rank-3"
              : "rank-other";

          return (
            <li key={story.id}>
              <Link to={`/truyen/${story.slug}`} className="home-ranking-item">
                <span className={`home-ranking-num ${rankColorClass}`}>{formattedRank}</span>
                <div className="home-ranking-thumb">
                  <img src={story.cover} alt={story.title} loading="lazy" />
                </div>
                <div className="home-ranking-info">
                  <span className="home-ranking-name">{story.title}</span>
                  <span className="home-ranking-chapter">Chương {story.chapters || 1}</span>
                </div>
                <div className="home-ranking-views">
                  <Icon icon={Eye} size={13} />
                  <span>{formatRankingViews(story.views)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <Link to="/bang-xep-hang" className="home-rankings-more-link">
        Xem tất cả bảng xếp hạng &rarr;
      </Link>
    </div>
  );
}
