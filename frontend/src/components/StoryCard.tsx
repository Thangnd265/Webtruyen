import { useState } from "react";
import { BookOpen, Headphones, Star } from "lucide-react";
import { Link } from "react-router-dom";
import type { Story } from "../data/types";
import { Icon } from "./Icon";

export function StoryCard({ story, variant = "compact", rank }: { story: Story; variant?: "horizontal" | "compact" | "ranked"; rank?: number }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return <article className={`story-card story-card-${variant}`}>
    {rank !== undefined && <span className="story-rank" aria-label={`Hạng ${rank}`}>{rank}</span>}
    <Link className="story-cover" to={`/truyen/${story.slug}`} tabIndex={-1} aria-hidden="true">{!coverFailed && <img src={story.cover} alt="" loading="lazy" onError={() => setCoverFailed(true)} />}</Link>
    <div className="story-body">
      <span className="story-category">{story.category}</span>
      <h3><Link to={`/truyen/${story.slug}`}>{story.title}</Link></h3>
      <p className="story-author">{story.author}</p>
      {variant === "horizontal" && <p className="story-description">{story.description}</p>}
      <div className="story-meta"><span><Icon icon={BookOpen} size={16} /> {story.chapters} chương</span><span><Icon icon={Star} size={16} /> {story.rating.toFixed(1)}</span>{story.hasAudio && <span><Icon icon={Headphones} size={16} /> Audio</span>}</div>
    </div>
  </article>;
}
