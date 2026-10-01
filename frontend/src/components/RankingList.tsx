import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { comments } from "../data/site";
import { stories as fallbackStories } from "../data/stories";
import { getStories } from "../data/api";
import type { Story } from "../data/types";

export function RankingList({ type = "stories" }: { type?: "stories" | "members" }) {
  const [stories, setStories] = useState<Story[]>(fallbackStories);

  useEffect(() => {
    let active = true;
    getStories().then((list) => {
      if (active && list.length > 0) setStories(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ol className="ranking-list" aria-label={type === "stories" ? "Truyện nổi bật" : "Thành viên tích cực"}>
      {type === "stories"
        ? stories.slice(0, 5).map((story, index) => (
            <li key={story.id}>
              <span className="ranking-number">{index + 1}</span>
              <Link to={`/truyen/${story.slug}`}>{story.title}</Link>
              <span>{story.views.toLocaleString("vi-VN")} lượt đọc</span>
            </li>
          ))
        : comments.map((comment, index) => (
            <li key={comment.id}>
              <span className="ranking-number">{index + 1}</span>
              <strong>{comment.author}</strong>
              <span>Độc giả tích cực</span>
            </li>
          ))}
    </ol>
  );
}
