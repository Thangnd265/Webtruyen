export type StoryStatus = "ongoing" | "completed";

export interface Story {
  id: string;
  slug: string;
  title: string;
  author: string;
  cover: string;
  category: string;
  tags: string[];
  status: StoryStatus;
  chapters: number;
  views: number;
  rating: number;
  hasAudio: boolean;
  description: string;
  updatedAt: string;
}

export interface HeroSlide { storyId: string; eyebrow: string; title: string; description: string }
export interface StoryComment { id: string; storyId: string; author: string; content: string; createdAt: string }
export interface RankingEntry { storyId: string; position: number }
export interface MembershipPlan { id: string; name: string; price: number; durationDays: number; benefits: string[] }
export interface Chapter { id: string; storyId: string; number: number; title: string; publishedAt: string; audioLocked?: boolean }
export interface NavigationGroup { title: string; links: { label: string; href: string }[] }
