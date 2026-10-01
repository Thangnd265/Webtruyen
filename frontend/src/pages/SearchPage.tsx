import { CatalogPage } from "./CatalogPage";

export function SearchPage({ title = "Tìm kiếm" }: { title?: string }) {
  return <CatalogPage title={title} />;
}
