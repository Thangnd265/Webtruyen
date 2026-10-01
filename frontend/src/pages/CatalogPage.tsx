import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FilterPanel } from "../components/FilterPanel";
import { Pagination } from "../components/Pagination";
import { StoryGrid } from "../components/StoryGrid";
import { filterStories, type StoryFilters } from "../data/catalog";
import { getStories } from "../data/api";
import { stories as fallbackStories } from "../data/stories";
import type { Story } from "../data/types";

const pageSize = 8;

export function CatalogPage({ title = "Danh sách truyện", audioOnly = false }: { title?: string; audioOnly?: boolean }) {
  const [stories, setStories] = useState<Story[]>(fallbackStories);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    let active = true;
    getStories().then((list) => {
      if (active && list.length > 0) {
        setStories(list);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const categories = [...new Set(stories.map((story) => story.category))];
  const status = params.get("status");
  const sort = params.get("sort");
  const chapterParam = params.get("chapters");
  const chapters = chapterParam === null ? undefined : Number(chapterParam);
  const filters: StoryFilters = {
    query: params.get("q") || undefined,
    category: params.get("category") || undefined,
    status: status === "ongoing" || status === "completed" ? status : undefined,
    minimumChapters: chapters !== undefined && Number.isFinite(chapters) && chapters >= 0 ? chapters : undefined,
    audioOnly: audioOnly || params.get("audio") === "true" ? true : undefined,
    sort: sort === "new" || sort === "views" || sort === "rating" ? sort : "featured",
  };
  const results = filterStories(stories, filters);
  const totalPages = Math.ceil(results.length / pageSize);
  const requestedPage = Number(params.get("page"));
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages || 1);

  function changeFilters(next: StoryFilters) {
    const updated = new URLSearchParams();
    if (next.query) updated.set("q", next.query);
    if (next.category) updated.set("category", next.category);
    if (next.status) updated.set("status", next.status);
    if (next.minimumChapters !== undefined) updated.set("chapters", String(next.minimumChapters));
    if (!audioOnly && next.audioOnly) updated.set("audio", "true");
    if (next.sort && next.sort !== "featured") updated.set("sort", next.sort);
    setParams(updated, { replace: true });
  }

  return (
    <div className="catalog-page">
      <header className="page-heading">
        <p className="eyebrow">KHÁM PHÁ TRUYỆN</p>
        <h1>{title}</h1>
        <p>Lựa chọn câu chuyện hợp với bạn từ kho truyện của Tiểu Thuyết Mạng.</p>
      </header>
      <FilterPanel filters={filters} onChange={changeFilters} categories={categories} showAudioFilter={!audioOnly} showReset={results.length > 0} />
      <div className="catalog-summary">
        <h2>Kết quả tìm kiếm</h2>
        <span>{results.length} truyện</span>
      </div>
      {results.length ? (
        <>
          <StoryGrid stories={results.slice((page - 1) * pageSize, page * pageSize)} />
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(next) => {
              const updated = new URLSearchParams(params);
              updated.set("page", String(next));
              setParams(updated);
            }}
          />
        </>
      ) : (
        <div className="catalog-empty">
          <h2>Không tìm thấy truyện</h2>
          <p>Thử từ khóa hoặc bộ lọc khác để tiếp tục khám phá.</p>
          <button className="button button-primary" type="button" onClick={() => changeFilters({})}>
            Xóa bộ lọc
          </button>
        </div>
      )}
    </div>
  );
}
