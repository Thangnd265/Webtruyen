import type { Story, HeroSlide } from "./types";
import { stories as fallbackStories } from "./stories";
import { heroSlides as fallbackSlides } from "./site";

export interface VoiceOption {
  id: string;
  name: string;
  gender?: string;
  region?: string;
  desc?: string;
}

export interface BackendChapter {
  id: string;
  title: string;
  chapter_index?: number;
  has_audio?: boolean;
  audio_url?: string;
  available_voices?: VoiceOption[];
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
  available_voices?: VoiceOption[];
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
  current_voice?: string;
  available_voices?: VoiceOption[];
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
    bannerPosition: b.banner_position || "center 20%",
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

const storyDetailCache = new Map<string, { story: Story; chapters: BackendChapter[] }>();
const chapterContentCache = new Map<string, ChapterContent>();
const audioPreloadMap = new Map<string, HTMLAudioElement>();

export function preloadAudio(url: string): HTMLAudioElement {
  if (audioPreloadMap.has(url)) {
    return audioPreloadMap.get(url)!;
  }
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  audioPreloadMap.set(url, audio);

  // Keep cache bounded to 5 items to avoid unnecessary memory consumption
  if (audioPreloadMap.size > 5) {
    const firstKey = audioPreloadMap.keys().next().value;
    if (firstKey) {
      const oldAudio = audioPreloadMap.get(firstKey);
      if (oldAudio) {
        oldAudio.src = "";
      }
      audioPreloadMap.delete(firstKey);
    }
  }
  return audio;
}

export function getCachedChapterContent(
  slug: string,
  chapterId: string,
  voice?: string
): ChapterContent | null {
  const cacheKey = `${slug}:${chapterId}:${voice || ""}`;
  return chapterContentCache.get(cacheKey) || null;
}

export async function preloadChapter(
  slug: string,
  chapterId: string,
  voice?: string,
  audioUrl?: string
): Promise<void> {
  const targetAudioUrl =
    audioUrl ||
    (voice
      ? `/api/books/${slug}/audio/${chapterId}?voice=${encodeURIComponent(voice)}`
      : `/api/books/${slug}/audio/${chapterId}`);
  preloadAudio(targetAudioUrl);
  await getChapterContent(slug, chapterId, voice);
}

export async function getStoryDetail(
  slug: string,
  forceRefresh = false
): Promise<{ story: Story; chapters: BackendChapter[] } | null> {
  if (!forceRefresh && storyDetailCache.has(slug)) {
    return storyDetailCache.get(slug)!;
  }

  try {
    const res = await fetch(`/api/books/${slug}`, { cache: "no-store" });
    if (res.ok) {
      const data: BackendBookDetail = await res.json();
      const story = mapBackendBookToStory(data);
      const detail = { story, chapters: data.chapters || [] };
      storyDetailCache.set(slug, detail);
      return detail;
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

export async function getChapterContent(
  slug: string,
  chapterId: string,
  voice?: string
): Promise<ChapterContent | null> {
  const cacheKey = `${slug}:${chapterId}:${voice || ""}`;
  if (chapterContentCache.has(cacheKey)) {
    return chapterContentCache.get(cacheKey)!;
  }

  try {
    const url = voice
      ? `/api/books/${slug}/chapters/${chapterId}?voice=${encodeURIComponent(voice)}`
      : `/api/books/${slug}/chapters/${chapterId}`;
    const res = await fetch(url);
    if (res.ok) {
      const data: ChapterContent = await res.json();
      chapterContentCache.set(cacheKey, data);
      return data;
    }
  } catch (err) {
    console.warn(`Could not fetch /api/books/${slug}/chapters/${chapterId}:`, err);
  }
  return null;
}

