import { Link } from "react-router-dom";
import { comments, rankings } from "../data/site";
import { stories } from "../data/stories";

export function RankingList({ type = "stories" }: { type?: "stories" | "members" }) {
  return <ol className="ranking-list" aria-label={type === "stories" ? "Truyện nổi bật" : "Thành viên tích cực"}>
    {type === "stories" ? rankings.map(({ storyId, position }) => {
      const story = stories.find((item) => item.id === storyId);
      return story && <li key={storyId}><span className="ranking-number">{position}</span><Link to={`/truyen/${story.slug}`}>{story.title}</Link><span>{story.views.toLocaleString("vi-VN")} lượt đọc</span></li>;
    }) : comments.map((comment, index) => <li key={comment.id}><span className="ranking-number">{index + 1}</span><strong>{comment.author}</strong><span>Độc giả tích cực</span></li>)}
  </ol>;
}
