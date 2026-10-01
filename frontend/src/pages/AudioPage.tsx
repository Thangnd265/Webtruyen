import { Link, useParams } from "react-router-dom";
import { AudioPlayer } from "../components/AudioPlayer";
import { chapters } from "../data/site";
import { stories } from "../data/stories";
import { NotFoundPage } from "./NotFoundPage";

export function AudioPage() {
  const { slug, chapter } = useParams();
  const story = stories.find((item) => item.slug === slug);
  const number = chapter && /^[1-9]\d*$/.test(chapter) ? Number(chapter) : NaN;
  if (!story || !story.hasAudio || !Number.isSafeInteger(number) || number > story.chapters) return <NotFoundPage />;

  const path = `/truyen/${story.slug}`;
  const named = chapters.find((item) => item.storyId === story.id && item.number === number);
  return <div className="audio-page"><nav className="reading-breadcrumb" aria-label="Đường dẫn"><Link to={path}>{story.title}</Link><span aria-hidden="true">/</span><span>Nghe truyện</span></nav><div className="audio-layout"><div className="audio-art"><img src={story.cover} alt={`Bìa truyện ${story.title}`} /></div><div className="audio-content"><p className="eyebrow">BẢN NGHE MẪU</p><h1>Chương {number}{named ? `: ${named.title}` : ""}</h1><p>{story.title} · {story.author}</p><p className="audio-note">Các nút phát minh họa trải nghiệm nghe. Trang này chưa có tệp âm thanh.</p><AudioPlayer key={`${story.id}-${number}`} storyPath={path} chapter={number} totalChapters={story.chapters} locked={named?.audioLocked} /><Link className="button" to={`${path}/doc/${number}`}>Đọc chương này</Link></div></div></div>;
}
