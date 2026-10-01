import { ChevronLeft, ChevronRight } from "lucide-react";
import { Icon } from "./Icon";

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Phân trang"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><Icon icon={ChevronLeft} /></button>{Array.from({ length: totalPages }, (_, index) => <button key={index} type="button" aria-label={`Trang ${index + 1}`} aria-current={page === index + 1 ? "page" : undefined} onClick={() => onPageChange(index + 1)}>{index + 1}</button>)}<button type="button" aria-label="Trang tiếp" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><Icon icon={ChevronRight} /></button></nav>;
}
