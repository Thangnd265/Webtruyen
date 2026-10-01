import type { Story, StoryStatus } from "./types";

export interface StoryFilters {
  query?: string;
  category?: string;
  status?: StoryStatus;
  minimumChapters?: number;
  audioOnly?: boolean;
  sort?: "new" | "views" | "rating" | "featured";
}

export function filterStories(stories: Story[], filters: StoryFilters): Story[] {
  const query = filters.query?.trim().toLocaleLowerCase("vi");
  const result = stories.filter((story) =>
    (!query || [story.title, story.author, story.category, story.description, ...story.tags]
      .some((value) => value.toLocaleLowerCase("vi").includes(query))) &&
    (!filters.category || story.category === filters.category) &&
    (!filters.status || story.status === filters.status) &&
    (filters.minimumChapters === undefined || story.chapters >= filters.minimumChapters) &&
    (filters.audioOnly === undefined || story.hasAudio === filters.audioOnly),
  );

  switch (filters.sort) {
    case "new": return result.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    case "views": return result.sort((a, b) => b.views - a.views);
    case "rating": return result.sort((a, b) => b.rating - a.rating);
    default: return result;
  }
}
