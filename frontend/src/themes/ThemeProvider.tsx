import { useEffect, useState, type ReactNode } from "react";
import { themes } from ".";
import { ThemeContext, type AppearanceOverrides } from "./useTheme";
import type { ThemeMode } from "./types";
import { useAuth } from "../context/AuthContext";

const storageKey = "ttm-appearance";
const variables = {
  accentColor: "--color-accent",
  fontScale: "--font-scale",
  contentWidth: "--content-width",
  readerLineHeight: "--reader-line-height",
} as const;

type Appearance = { themeId: string; mode: ThemeMode; overrides: AppearanceOverrides };

function contrast(first: string, second: string) {
  const luminance = (color: string) => {
    const channels = /^#[\da-f]{6}$/i.test(color) ? color.slice(1).match(/../g)!.map((part) => parseInt(part, 16)) : color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    return channels?.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0) ?? NaN;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function validOverride(key: keyof AppearanceOverrides, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (key === "accentColor") return /^#[\da-f]{6}$/i.test(value);
  const number = Number(value);
  return Number.isFinite(number) && (
    key === "fontScale" ? number >= 0.8 && number <= 1.4 :
    key === "contentWidth" ? number >= 480 && number <= 1200 :
    number >= 1.2 && number <= 2.2
  );
}

function readAppearance(): Appearance {
  const fallback: Appearance = { themeId: themes[0].id, mode: themes[0].modes[0], overrides: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!stored || typeof stored !== "object") return fallback;
    const overrides: AppearanceOverrides = {};
    for (const key of Object.keys(variables) as (keyof AppearanceOverrides)[]) {
      if (validOverride(key, stored.overrides?.[key])) overrides[key] = stored.overrides[key];
    }
    const theme = themes.find((theme) => theme.id === stored.themeId) ?? themes[0];
    return {
      themeId: theme.id,
      mode: theme.modes.includes(stored.mode) ? stored.mode : theme.modes[0],
      overrides,
    };
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences } = useAuth();
  const [appearance, setAppearance] = useState(readAppearance);
  const [accentError, setAccentError] = useState<string | null>(null);

  // Sync from user preferences when user logs in or preferences are loaded from server
  useEffect(() => {
    if (preferences && (preferences.themeId || preferences.mode || preferences.overrides)) {
      setAppearance((current) => {
        const theme = themes.find((t) => t.id === preferences.themeId) ?? themes.find((t) => t.id === current.themeId) ?? themes[0];
        const mode = preferences.mode && theme.modes.includes(preferences.mode) ? preferences.mode : current.mode;
        const overrides = preferences.overrides ? { ...current.overrides, ...preferences.overrides } : current.overrides;
        return {
          themeId: theme.id,
          mode,
          overrides,
        };
      });
    }
  }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance.themeId;
    root.dataset.mode = appearance.mode;
    root.style.removeProperty("--color-accent-hover");
    root.style.removeProperty("--color-on-accent");
    for (const key of Object.keys(variables) as (keyof AppearanceOverrides)[]) {
      const value = key === "accentColor" ? undefined : appearance.overrides[key];
      const cssValue = value === undefined ? "" : key === "fontScale" ? value : key === "contentWidth" ? `${value}px` : value;
      root.style.setProperty(variables[key], cssValue);
    }
    const accent = appearance.overrides.accentColor;
    if (accent) {
      const style = getComputedStyle(root);
      if (!["--color-bg", "--color-surface"].every((token) => contrast(accent, style.getPropertyValue(token).trim()) >= 4.5)) {
        setAccentError("Màu đã chọn không đủ tương phản. Đã khôi phục màu của chủ đề; hãy chọn màu đậm hơn ở chế độ sáng hoặc nhạt hơn ở chế độ tối.");
        setAppearance((current) => {
          const overrides = { ...current.overrides };
          delete overrides.accentColor;
          return { ...current, overrides };
        });
        return;
      }
      root.style.setProperty("--color-accent", accent);
      root.style.setProperty("--color-accent-hover", accent);
      root.style.setProperty("--color-on-accent", contrast(accent, "#ffffff") >= 4.5 ? "#ffffff" : "#000000");
      setAccentError(null);
    }
    try { localStorage.setItem(storageKey, JSON.stringify(appearance)); } catch { /* Storage may be unavailable. */ }
  }, [appearance]);

  return (
    <ThemeContext.Provider value={{
      themes,
      ...appearance,
      accentError,
      setThemeId: (themeId) => {
        const theme = themes.find((item) => item.id === themeId);
        if (theme) {
          const nextMode = theme.modes.includes(appearance.mode) ? appearance.mode : theme.modes[0];
          setAppearance((current) => ({ ...current, themeId, mode: nextMode }));
          updatePreferences({ themeId, mode: nextMode });
        }
      },
      setMode: (mode) => {
        setAppearance((current) => {
          const updated = themes.find((theme) => theme.id === current.themeId)!.modes.includes(mode) ? { ...current, mode } : current;
          updatePreferences({ mode: updated.mode });
          return updated;
        });
      },
      setOverride: (key, value) => {
        if (key === "accentColor") setAccentError(null);
        if (validOverride(key, value)) {
          setAppearance((current) => {
            const newOverrides = { ...current.overrides, [key]: value };
            updatePreferences({ overrides: newOverrides });
            return { ...current, overrides: newOverrides };
          });
        }
      },
      resetOverrides: () => {
        setAccentError(null);
        setAppearance((current) => {
          updatePreferences({ overrides: {} });
          return { ...current, overrides: {} };
        });
      },
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
