import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export function Tabs({ label, items }: { label: string; items: { id: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(items[0].id);
  const baseId = useId();
  const active = items.find((item) => item.id === selected) ?? items[0];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setSelected(items[next].id);
    document.getElementById(`${baseId}-tab-${items[next].id}`)?.focus();
  }

  return <div className="story-tabs"><div className="ranking-tabs" role="tablist" aria-label={label}>{items.map((item, index) => <button key={item.id} id={`${baseId}-tab-${item.id}`} type="button" role="tab" aria-selected={active.id === item.id} aria-controls={`${baseId}-panel`} tabIndex={active.id === item.id ? 0 : -1} onClick={() => setSelected(item.id)} onKeyDown={(event) => onKeyDown(event, index)}>{item.label}</button>)}</div><section id={`${baseId}-panel`} className="story-tab-panel" role="tabpanel" aria-labelledby={`${baseId}-tab-${active.id}`} tabIndex={0}>{active.content}</section></div>;
}
