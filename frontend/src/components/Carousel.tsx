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

  return <section className="hero-carousel hero-carousel-full-bleed" aria-label="Truyện nổi bật" aria-roledescription="carousel">
    {story && <img key={story.id} className="hero-image hero-image-enter" src={heroImage} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    <div className="hero-content"><p className="eyebrow hero-eyebrow">{slide.eyebrow}</p><h2>{slide.title}</h2>{story && <p className="hero-meta"><span>Tác giả: <strong>{story.author}</strong></span><span aria-hidden="true">•</span><span>{story.chapters} chương</span>{story.hasAudio && <><span aria-hidden="true">•</span><span>Có audio</span></>}</p>}<p className="hero-description">{slide.description}</p>{story && <Link className="button button-primary" to={`/truyen/${story.slug}`}>Đọc truyện</Link>}</div>
    <div className="carousel-controls"><button type="button" className="icon-button hero-arrow hero-arrow-prev" aria-label="Trang trước" onClick={() => next(-1)}><Icon icon={ChevronLeft} /></button><span className="carousel-count" aria-live="polite">{activeIndex + 1} / {slides.length}</span><button type="button" className="icon-button hero-arrow hero-arrow-next" aria-label="Trang tiếp" onClick={() => next(1)}><Icon icon={ChevronRight} /></button></div>
    <div className="carousel-dots" aria-label="Chọn truyện nổi bật">{slides.map((item, dot) => <button key={item.storyId} type="button" aria-label={`Truyện nổi bật ${dot + 1}`} aria-current={dot === activeIndex ? "true" : undefined} onClick={() => setIndex(dot)} />)}</div>
  </section>;
}
