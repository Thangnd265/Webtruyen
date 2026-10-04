import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { HeroSlide, Story } from "../data/types";
import { Icon } from "./Icon";

export function Carousel({ slides, stories }: { slides: HeroSlide[]; stories: Story[] }) {
  const [index, setIndex] = useState(0);
  if (!slides.length) return null;
  const activeIndex = index % slides.length;
  const slide = slides[activeIndex];
  const story = stories.find((entry) => entry.id === slide.storyId);
  const heroImage = story?.banner || story?.cover.replace("w=480", "w=1600");
  const next = (step: number) => setIndex((activeIndex + step + slides.length) % slides.length);

  return (
    <section className="hero-carousel hero-carousel-full-bleed" aria-label="Truyện nổi bật" aria-roledescription="carousel">
      {/* Ambient background glow matching the active slide */}
      <div
        className="hero-ambient-glow"
        style={{ backgroundImage: `url("${heroImage}")` }}
        aria-hidden="true"
      />
      {story ? (
        <Link
          to={`/truyen/${story.slug}`}
          className="hero-banner-link"
          aria-label={`Đọc truyện ${story.title || slide.title}`}
        >
          <img
            key={story.id}
            className="hero-image hero-image-enter"
            src={heroImage}
            alt=""
            style={{ objectPosition: story.bannerPosition || "center 20%" }}
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <div className="hero-overlay" aria-hidden="true" />
          <div className="hero-content">
            <h2>{story.title || slide.title}</h2>
          </div>
        </Link>
      ) : (
        <div className="hero-banner-link">
          <div className="hero-overlay" aria-hidden="true" />
          <div className="hero-content">
            <h2>{slide.title}</h2>
          </div>
        </div>
      )}

      <div className="carousel-controls">
        <button
          type="button"
          className="icon-button hero-arrow hero-arrow-prev"
          aria-label="Trang trước"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); next(-1); }}
        >
          <Icon icon={ChevronLeft} />
        </button>
        <span className="carousel-count" aria-live="polite">{activeIndex + 1} / {slides.length}</span>
        <button
          type="button"
          className="icon-button hero-arrow hero-arrow-next"
          aria-label="Trang tiếp"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); next(1); }}
        >
          <Icon icon={ChevronRight} />
        </button>
      </div>

      <div className="carousel-dots" aria-label="Chọn truyện nổi bật">
        {slides.map((item, dot) => (
          <button
            key={item.storyId}
            type="button"
            aria-label={`Truyện nổi bật ${dot + 1}`}
            aria-current={dot === activeIndex ? "true" : undefined}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIndex(dot); }}
          />
        ))}
      </div>
    </section>
  );
}
