import type { Story, HeroSlide } from "./types";
import { stories as fallbackStories } from "./stories";
import { heroSlides as fallbackSlides } from "./site";

export interface BackendChapter {
  id: string;
  title: string;
  chapter_index?: number;
  has_audio?: boolean;
  audio_url?: string;
}

export interface BackendBookDetail {
  slug: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  total_chapters: number;
  genres: string | string[];
  status: string;
  views: string | number;
  rating: number;
  updated_at: string;
  chapters: BackendChapter[];
}

export interface ChapterCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface ChapterContent {
  chapter_id: string;
  title: string;
  html: string;
  cues: ChapterCue[];
  audio_url: string;
}

export function mapBackendBookToStory(b: any): Story {
  const genres = b.genres || b.genre || "Tiên Hiệp";
  const category = Array.isArray(genres)
    ? genres[0]
    : typeof genres === "string"
    ? genres.split(",")[0].trim()
    : "Tiên Hiệp";
  const tags = Array.isArray(genres)
    ? genres
    : typeof genres === "string"
    ? genres.split(",").map((s: string) => s.trim())
    : ["Tiên Hiệp"];

  return {
    id: b.slug,
    slug: b.slug,
    title: b.title || b.slug.replace(/-/g, " "),
    author: b.author || "Tác giả ẩn danh",
    cover: b.cover_url || `/api/books/${b.slug}/cover`,
    banner: b.banner_url || `/api/books/${b.slug}/banner`,
    category,
    tags,
    status: b.status === "Hoàn thành" || b.status === "completed" ? "completed" : "ongoing",
    chapters: b.total_chapters || (b.chapters ? b.chapters.length : 1),
    views: typeof b.views === "number" ? b.views : parseInt(b.views, 10) || 18500,
    rating: b.rating || 4.8,
    hasAudio: true,
    description: b.description || `Bộ truyện ${b.title || b.slug} của tác giả ${b.author || "Ẩn danh"}.`,
    updatedAt: b.updated_at || "Vừa xong",
  };
}

let cachedStories: Story[] | null = null;

export async function getStories(): Promise<Story[]> {
  try {
    const res = await fetch("/api/books", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        cachedStories = data.map(mapBackendBookToStory);
        return cachedStories;
      }
    }
  } catch (err) {
    console.warn("Could not fetch /api/books:", err);
  }
  return cachedStories || fallbackStories;
}

export function buildDynamicHeroSlides(stories: Story[]): HeroSlide[] {
  if (!stories.length) return fallbackSlides;
  return stories.slice(0, 4).map((s, idx) => ({
    storyId: s.id,
    eyebrow: idx === 0 ? "ĐỀ CỬ NỔI BẬT" : s.hasAudio ? "NGHE MỌI LÚC" : "VỪA LÊN KỆ",
    title: s.title,
    description: s.description || `${s.title} của tác giả ${s.author}. Bản dịch chất lượng cao, đồng bộ audio.`,
  }));
}

export async function getStoryDetail(slug: string): Promise<{ story: Story; chapters: BackendChapter[] } | null> {
  try {
    const res = await fetch(`/api/books/${slug}`, { cache: "no-store" });
    if (res.ok) {
      const data: BackendBookDetail = await res.json();
      const story = mapBackendBookToStory(data);
      return { story, chapters: data.chapters || [] };
    }
  } catch (err) {
    console.warn("Could not fetch /api/books/" + slug, err);
  }
  const fallback = (cachedStories || fallbackStories).find((s) => s.slug === slug);
  if (fallback) {
    const mockChapters: BackendChapter[] = Array.from({ length: fallback.chapters }, (_, i) => ({
      id: `chapter_${String(i + 1).padStart(3, "0")}`,
      title: `Chương ${i + 1}`,
      chapter_index: i + 1,
      has_audio: fallback.hasAudio,
    }));
    return { story: fallback, chapters: mockChapters };
  }
  return null;
}

export async function getChapterContent(slug: string, chapterId: string): Promise<ChapterContent | null> {
  try {
    const res = await fetch(`/api/books/${slug}/chapters/${chapterId}`);
    if (res.ok) {
      const data: ChapterContent = await res.json();
      return data;
    }
  } catch (err) {
    console.warn(`Could not fetch /api/books/${slug}/chapters/${chapterId}:`, err);
  }
  return null;
}
