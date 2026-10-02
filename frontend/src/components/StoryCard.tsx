import { useState } from "react";
import { BookOpen, Clock, Eye, Flag, Folder, Headphones, Star, User } from "lucide-react";
import { Link } from "react-router-dom";
import type { Story } from "../data/types";
import { Icon } from "./Icon";

function formatViews(views?: number): string {
  if (!views) return "3,2k";
  if (views >= 1000000) return `${(views / 1000000).toFixed(1).replace(".", ",")}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1).replace(".", ",")}k`;
  return views.toString();
}

function formatDate(dateStr?: string): string {
  if (!dateStr || dateStr === "Vừa xong") {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

export function StoryCard({
  story,
  variant = "compact",
  rank,
  badge,
}: {
  story: Story;
  variant?: "horizontal" | "compact" | "ranked" | "poster";
  rank?: number;
  badge?: string;
}) {
  const [coverFailed, setCoverFailed] = useState(false);

  if (variant === "poster") {
    const badgeText = badge ?? (story.featured ? "★ Đề cử" : "★ Mới");
    const isNew = badgeText.includes("Mới");
    return (
      <article className="story-card-poster">
        <div className="story-cover-wrapper-poster">
          {badgeText && (
            <span className={`story-badge-poster ${isNew ? "badge-new" : "badge-nominate"}`}>
              {badgeText}
            </span>
          )}
          <Link className="story-cover-poster" to={`/truyen/${story.slug}`} tabIndex={-1} aria-hidden="true">
            {!coverFailed ? (
              <img src={story.cover} alt={story.title} loading="lazy" onError={() => setCoverFailed(true)} />
            ) : (
              <div className="story-cover-placeholder">
                <Icon icon={BookOpen} size={28} />
              </div>
            )}
          </Link>
        </div>
        <div className="story-body-poster">
          <h3 className="story-title-poster">
            <Link to={`/truyen/${story.slug}`}>{story.title}</Link>
          </h3>
          <div className="story-meta-poster">
            <span className="meta-poster-item">
              <Icon icon={BookOpen} size={12} />
              <span>{story.chapters || 0} chương</span>
            </span>
            <span className="meta-poster-item">
              <Icon icon={Eye} size={12} />
              <span>{formatViews(story.views)}</span>
            </span>
          </div>
          <div className="story-rating-poster">
            <Icon icon={Star} size={13} />
            <span>{(story.rating || 4.5).toFixed(1)}</span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "horizontal") {
    const isCompleted = story.status === "completed";
    const statusText = isCompleted ? "Hoàn thành" : "Đang ra";
    const tagsText =
      story.tags && story.tags.length > 0 ? story.tags.slice(0, 2).join(", ") : story.category;
    const audioUrl = `/truyen/${story.slug}/nghe/1`;

    return (
      <article className="story-card story-card-horizontal">
        {rank !== undefined && (
          <span className="story-rank" aria-label={`Hạng ${rank}`}>
            {rank}
          </span>
        )}
        <div className="story-cover-wrapper">
          <span className="story-audio-badge">
            <Icon icon={Headphones} size={11} />
            <span>Audio</span>
          </span>
          <Link className="story-cover" to={`/truyen/${story.slug}`} tabIndex={-1} aria-hidden="true">
            {!coverFailed ? (
              <img src={story.cover} alt={story.title} loading="lazy" onError={() => setCoverFailed(true)} />
            ) : (
              <div className="story-cover-placeholder">
                <Icon icon={BookOpen} size={28} />
              </div>
            )}
          </Link>
        </div>

        <div className="story-body">
          <h3 className="story-title">
            <Link to={`/truyen/${story.slug}`}>{story.title}</Link>
          </h3>

          <div className="story-meta-row">
            <span className="meta-item">
              <Icon icon={User} size={13} />
              <span>{story.author || "Tác Giả Ẩn Danh"}</span>
            </span>
            <span className="meta-item">
              <Icon icon={Folder} size={13} />
              <span>{tagsText}</span>
            </span>
            <span className={`meta-item meta-status ${isCompleted ? "status-completed" : "status-ongoing"}`}>
              <Icon icon={Flag} size={13} />
              <span>{statusText}</span>
            </span>
          </div>

          <div className="story-meta-row">
            <span className="meta-item">
              <Icon icon={BookOpen} size={13} />
              <span>{story.chapters} chương</span>
            </span>
            <span className="meta-item">
              <Icon icon={Eye} size={13} />
              <span>{formatViews(story.views)}</span>
            </span>
            <span className="meta-item">
              <Icon icon={Clock} size={13} />
              <span>{formatDate(story.updatedAt)}</span>
            </span>
          </div>

          {story.description && (
            <p className="story-description">{story.description}</p>
          )}

          <div className="story-actions">
            <Link to={audioUrl} className="story-audio-btn">
              <Icon icon={Headphones} size={14} />
              <span>Nghe Audio</span>
            </Link>
          </div>
        </div>
      </article>
    );
  }

  // compact & ranked fallback
  return (
    <article className={`story-card story-card-${variant}`}>
      {rank !== undefined && (
        <span className="story-rank" aria-label={`Hạng ${rank}`}>
          {rank}
        </span>
      )}
      <div className="story-cover-wrapper-compact">
        {story.hasAudio && (
          <span className="story-audio-badge-compact" title="Có Audio">
            <Icon icon={Headphones} size={11} />
          </span>
        )}
        <Link className="story-cover" to={`/truyen/${story.slug}`} tabIndex={-1} aria-hidden="true">
          {!coverFailed ? (
            <img src={story.cover} alt={story.title} loading="lazy" onError={() => setCoverFailed(true)} />
          ) : (
            <div className="story-cover-placeholder">
              <Icon icon={BookOpen} size={20} />
            </div>
          )}
        </Link>
      </div>
      <div className="story-body">
        <span className="story-category">{story.category}</span>
        <h3>
          <Link to={`/truyen/${story.slug}`}>{story.title}</Link>
        </h3>
        <p className="story-author">{story.author}</p>
        <div className="story-meta">
          <span>
            <Icon icon={BookOpen} size={13} /> {story.chapters} ch
          </span>
          <span>
            <Icon icon={Star} size={13} /> {story.rating.toFixed(1)}
          </span>
        </div>
      </div>
    </article>
  );
}
