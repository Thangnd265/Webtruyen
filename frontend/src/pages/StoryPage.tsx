import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Tabs } from "../components/Tabs";
import { StoryGrid } from "../components/StoryGrid";
import { comments, chapters } from "../data/site";
import { stories } from "../data/stories";
import { NotFoundPage } from "./NotFoundPage";

export function StoryPage() {
  const [showAll, setShowAll] = useState(false);
  const { slug } = useParams();
  useEffect(() => { setShowAll(false); }, [slug]);
  const story = stories.find((item) => item.slug === slug);
  if (!story) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const recommendations = stories.filter((item) => item.id !== story.id && item.category === story.category).slice(0, 4);
  const latest = chapters.find((item) => item.storyId === story.id);
  const chapterNumbers = Array.from({ length: showAll ? story.chapters : Math.min(story.chapters, 12) }, (_, index) => index + 1);
  if (!showAll && story.chapters > 12) chapterNumbers.push(story.chapters);
  const chapterList = (audio: boolean) => <><ol className="chapter-list">{chapterNumbers.map((number) => <li key={number}><Link to={`${path}/${audio ? "nghe" : "doc"}/${number}`}>Chương {number}{latest?.number === number ? `: ${latest.title}` : ""}</Link></li>)}</ol>{story.chapters > 12 && <button className="button chapter-expand" type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Thu gọn" : "Xem tất cả chương"}</button>}</>;
  const storyComments = comments.filter((comment) => comment.storyId === story.id);

  return <div className="story-page">
    <div className="story-detail-hero"><div className="story-detail-cover"><img src={story.cover} alt={`Bìa truyện ${story.title}`} /></div><div className="story-detail-intro"><p className="eyebrow">{story.category}</p><h1>{story.title}</h1><p className="story-detail-author">Tác giả: <strong>{story.author}</strong></p><div className="story-detail-stats"><span>{story.status === "completed" ? "Đã hoàn thành" : "Đang cập nhật"}</span><span>{story.chapters} chương</span><span>{new Intl.NumberFormat("vi-VN").format(story.views)} lượt đọc</span><span>{story.rating}/5 đánh giá</span></div><div className="story-detail-actions"><Link className="button button-primary" to={`${path}/doc/1`}>Đọc từ đầu</Link>{story.hasAudio && <Link className="button" to={`${path}/nghe/1`}>Nghe truyện</Link>}</div></div></div>
    <div className="story-detail-layout"><div className="story-detail-main"><Tabs label="Nội dung truyện" items={[
      { id: "info", label: "Thông tin", content: <><h2>Giới thiệu truyện</h2><p>{story.description}</p><div className="story-tags">{story.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><p className="story-rating">Độc giả đánh giá <strong>{story.rating}/5</strong></p></> },
      { id: "chapters", label: "Chương", content: <><h2>Danh sách chương</h2><p>Chọn một chương để bắt đầu đọc.</p>{chapterList(false)}</> },
      { id: "audio", label: "Audio", content: story.hasAudio ? <><h2>Danh sách audio</h2><p>Bản phát mẫu với điều khiển tương tác, chưa có tệp âm thanh.</p>{chapterList(true)}</> : <><h2>Chưa có audio</h2><p>Truyện này hiện chưa có phiên bản audio.</p></> },
      { id: "comments", label: "Bình luận", content: <><h2>Bình luận độc giả</h2>{storyComments.length ? <div className="story-comments">{storyComments.map((comment) => <blockquote key={comment.id}><p>{comment.content}</p><footer>{comment.author}</footer></blockquote>)}</div> : <p>Chưa có bình luận cho truyện này.</p>}</> },
    ]} /></div><aside className="story-detail-side"><div className="membership-callout"><p className="eyebrow">HỘI VIÊN</p><h2>Thêm thời gian cho câu chuyện hay</h2><p>Khám phá các gói hội viên mẫu dành cho độc giả.</p><Link className="button" to="/hoi-vien">Xem gói hội viên</Link></div>{recommendations.length > 0 && <section className="story-recommendations"><h2>Có thể bạn thích</h2><StoryGrid stories={recommendations} variant="compact" /></section>}</aside></div>
  </div>;
}
