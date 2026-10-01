import { Link } from "react-router-dom";
import { Carousel } from "../components/Carousel";
import { RankingList } from "../components/RankingList";
import { RatingFeed } from "../components/RatingFeed";
import { StoryGrid } from "../components/StoryGrid";
import { filterStories } from "../data/catalog";
import { heroSlides } from "../data/site";
import { stories } from "../data/stories";

export function HomePage() {
  return <div className="home-page">
    <h1 className="sr-only">Trang chủ Tiểu Thuyết Mạng</h1>
    <Carousel slides={heroSlides} stories={stories} />
    <div className="home-layout"><div className="home-content">
      <section className="discovery-section"><div className="section-heading"><div><p className="eyebrow">NGHE MỌI LÚC</p><h2>Truyện audio</h2></div><Link to="/truyen/audio">Xem tất cả</Link></div><StoryGrid stories={filterStories(stories, { audioOnly: true }).slice(0, 4)} /></section>
      <section className="discovery-section"><div className="section-heading"><div><p className="eyebrow">VỪA LÊN KỆ</p><h2>Mới cập nhật</h2></div><Link to="/truyen?sort=new">Xem tất cả</Link></div><StoryGrid stories={filterStories(stories, { sort: "new" }).slice(0, 4)} /></section>
      <section className="discovery-section"><div className="section-heading"><div><p className="eyebrow">TUYỂN CHỌN</p><h2>Biên tập đề cử</h2></div><Link to="/truyen">Khám phá</Link></div><StoryGrid stories={stories.filter((story) => heroSlides.some((slide) => slide.storyId === story.id))} variant="horizontal" /></section>
      <section className="discovery-section"><div className="section-heading"><div><p className="eyebrow">GÓC ĐỘC GIẢ</p><h2>Đánh giá mới</h2></div></div><RatingFeed /></section>
    </div><aside className="home-sidebar"><h2>Bảng xếp hạng</h2><RankingList /><Link className="sidebar-link" to="/bang-xep-hang">Xem bảng xếp hạng</Link></aside></div>
  </div>;
}
