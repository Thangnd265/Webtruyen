import { useState, type KeyboardEvent } from "react";
import { RankingList } from "../components/RankingList";

export function RankingsPage() {
  const [tab, setTab] = useState<"stories" | "members">("stories");
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "stories" ? "members" : "stories";
    setTab(next);
    document.getElementById(`ranking-tab-${next}`)?.focus();
  }
  return <div className="rankings-page"><header className="page-heading"><p className="eyebrow">ĐƯỢC YÊU THÍCH</p><h1>Bảng xếp hạng</h1><p>Những câu chuyện và độc giả nổi bật trong cộng đồng.</p></header>
    <div className="ranking-tabs" role="tablist" aria-label="Loại bảng xếp hạng"><button id="ranking-tab-stories" type="button" role="tab" aria-controls="ranking-panel" aria-selected={tab === "stories"} tabIndex={tab === "stories" ? 0 : -1} onClick={() => setTab("stories")} onKeyDown={onTabKeyDown}>Truyện</button><button id="ranking-tab-members" type="button" role="tab" aria-controls="ranking-panel" aria-selected={tab === "members"} tabIndex={tab === "members" ? 0 : -1} onClick={() => setTab("members")} onKeyDown={onTabKeyDown}>Thành viên</button></div>
    <section id="ranking-panel" className="ranking-panel" role="tabpanel" aria-labelledby={`ranking-tab-${tab}`} tabIndex={0}><RankingList type={tab} /></section>
  </div>;
}
