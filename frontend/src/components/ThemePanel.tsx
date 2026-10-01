import { useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "../themes/useTheme";

const controlStyle = { minHeight: 44, border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)", color: "var(--color-text)", padding: "8px 12px", cursor: "pointer" };

export function ThemePanel() {
  const { themes, themeId, mode, overrides, accentError, setThemeId, setMode, setOverride, resetOverrides } = useTheme();
  const colorInput = useRef<HTMLInputElement>(null);
  const [themeAccent, setThemeAccent] = useState("#000000");
  const activeTheme = themes.find((theme) => theme.id === themeId)!;
  useLayoutEffect(() => {
    if (colorInput.current) setThemeAccent(getComputedStyle(colorInput.current).getPropertyValue("--color-accent").trim());
  }, [themeId, mode]);

  return (
    <div className="theme-panel">
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 24px" }}>
        <legend>Chủ đề</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {themes.map((theme) => (
            <button key={theme.id} type="button" aria-pressed={themeId === theme.id} onClick={() => setThemeId(theme.id)} style={{ ...controlStyle, textAlign: "left", boxShadow: themeId === theme.id ? "inset 0 0 0 2px var(--color-accent)" : undefined }}>
              <strong>{theme.name}</strong><br />
              <span style={{ color: "var(--color-muted)" }}>{theme.description}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 24px" }}>
        <legend>Chế độ</legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeTheme.modes.map((supportedMode) => <button key={supportedMode} type="button" aria-pressed={mode === supportedMode} onClick={() => setMode(supportedMode)} style={controlStyle}>{supportedMode === "light" ? "Sáng" : "Tối"}</button>)}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 24px", display: "grid", gap: 16 }}>
        <legend>Tùy chỉnh cá nhân</legend>
        <label style={{ display: "grid", gap: 8 }}>Màu nhấn
          <input ref={colorInput} data-theme={themeId} data-mode={mode} type="color" aria-invalid={Boolean(accentError)} aria-describedby={accentError ? "accent-error" : undefined} value={overrides.accentColor ?? themeAccent} onChange={(event) => setOverride("accentColor", event.target.value)} />
        </label>
        {accentError && <p id="accent-error" className="field-error" role="alert">{accentError}</p>}
        <label style={{ display: "grid", gap: 8 }}>Cỡ chữ: {Math.round(Number(overrides.fontScale ?? 1) * 100)}%
          <input type="range" min="0.8" max="1.4" step="0.05" value={overrides.fontScale ?? "1"} onChange={(event) => setOverride("fontScale", event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 8 }}>Độ rộng nội dung: {overrides.contentWidth ?? "860"} px
          <input type="range" min="480" max="1200" step="20" value={overrides.contentWidth ?? "860"} onChange={(event) => setOverride("contentWidth", event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 8 }}>Giãn dòng: {overrides.readerLineHeight ?? "1.8"}
          <input type="range" min="1.2" max="2.2" step="0.1" value={overrides.readerLineHeight ?? "1.8"} onChange={(event) => setOverride("readerLineHeight", event.target.value)} />
        </label>
      </fieldset>
      <button type="button" onClick={resetOverrides} style={controlStyle}>Đặt lại tùy chỉnh</button>
    </div>
  );
}
