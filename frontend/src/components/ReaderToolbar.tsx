import { useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "./Modal";
import { useTheme } from "../themes/useTheme";

export function ReaderToolbar({ storyPath }: { storyPath: string }) {
  const { overrides, setOverride } = useTheme();
  const [reportOpen, setReportOpen] = useState(false);
  const fontScale = Number(overrides.fontScale ?? 1);
  const lineHeight = Number(overrides.readerLineHeight ?? 1.8);
  return <><div className="reader-toolbar" aria-label="Tùy chỉnh đọc"><div className="reader-tool-group"><span>Cỡ chữ</span><button type="button" aria-label="Giảm cỡ chữ" disabled={fontScale <= 0.8} onClick={() => setOverride("fontScale", (fontScale - 0.1).toFixed(1))}>A−</button><output>{Math.round(fontScale * 100)}%</output><button type="button" aria-label="Tăng cỡ chữ" disabled={fontScale >= 1.4} onClick={() => setOverride("fontScale", (fontScale + 0.1).toFixed(1))}>A+</button></div><div className="reader-tool-group"><span>Giãn dòng</span><button type="button" aria-label="Giảm giãn dòng" disabled={lineHeight <= 1.2} onClick={() => setOverride("readerLineHeight", (lineHeight - 0.1).toFixed(1))}>−</button><output>{lineHeight.toFixed(1)}</output><button type="button" aria-label="Tăng giãn dòng" disabled={lineHeight >= 2.2} onClick={() => setOverride("readerLineHeight", (lineHeight + 0.1).toFixed(1))}>+</button></div><button type="button" onClick={() => setReportOpen(true)}>Báo lỗi chương</button><Link to={storyPath}>Thông tin truyện</Link></div><Modal open={reportOpen} title="Báo lỗi chương" onClose={() => setReportOpen(false)}><p>Chức năng báo lỗi sẽ có trong phiên bản đầy đủ. Đây là bản xem trước.</p></Modal></>;
}
