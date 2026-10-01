import type { StoryFilters } from "../data/catalog";

export function FilterPanel({ filters, onChange, categories, showQuery = true, showAudioFilter = true, showReset = true }: { filters: StoryFilters; onChange: (filters: StoryFilters) => void; categories: string[]; showQuery?: boolean; showAudioFilter?: boolean; showReset?: boolean }) {
  const update = (next: Partial<StoryFilters>) => onChange({ ...filters, ...next });
  return <form className="filter-panel" role="search" onSubmit={(event) => event.preventDefault()}>
    {showQuery && <label>Tìm trong kho<input type="search" value={filters.query ?? ""} onChange={(event) => update({ query: event.target.value || undefined })} placeholder="Tên truyện, tác giả..." /></label>}
    <label>Thể loại<select value={filters.category ?? ""} onChange={(event) => update({ category: event.target.value || undefined })}><option value="">Tất cả</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label>Trạng thái<select value={filters.status ?? ""} onChange={(event) => update({ status: (event.target.value || undefined) as StoryFilters["status"] })}><option value="">Tất cả</option><option value="ongoing">Đang ra</option><option value="completed">Hoàn thành</option></select></label>
    <label>Số chương tối thiểu<input type="number" min="0" value={filters.minimumChapters ?? ""} onChange={(event) => update({ minimumChapters: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) })} /></label>
    <label>Sắp xếp<select value={filters.sort ?? "featured"} onChange={(event) => update({ sort: event.target.value as StoryFilters["sort"] })}><option value="featured">Nổi bật</option><option value="new">Mới cập nhật</option><option value="views">Lượt xem</option><option value="rating">Đánh giá</option></select></label>
    {showAudioFilter && <label className="filter-check"><input type="checkbox" checked={filters.audioOnly === true} onChange={(event) => update({ audioOnly: event.target.checked ? true : undefined })} /> Có audio</label>}
    {showReset && <button className="button" type="button" onClick={() => onChange({})}>Xóa bộ lọc</button>}
  </form>;
}
