import { Link } from "react-router-dom";
import { comments } from "../data/site";
import { stories } from "../data/stories";

export function RatingFeed() {
  return <div className="rating-feed">{comments.map((comment) => {
    const story = stories.find((item) => item.id === comment.storyId);
    return <blockquote key={comment.id}><p>“{comment.content}”</p><footer><strong>{comment.author}</strong>{story && <Link to={`/truyen/${story.slug}`}>{story.title}</Link>}</footer></blockquote>;
  })}</div>;
}
