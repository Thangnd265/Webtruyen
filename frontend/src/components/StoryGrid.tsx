import type { Story } from "../data/types";
import { StoryCard } from "./StoryCard";

export function StoryGrid({ stories, variant = "compact" }: { stories: Story[]; variant?: "horizontal" | "compact" | "ranked" | "poster" }) {
  return <div className={`story-grid story-grid-${variant}`}>{stories.map((story, index) => <StoryCard key={story.id} story={story} variant={variant} rank={variant === "ranked" ? index + 1 : undefined} />)}</div>;
}
