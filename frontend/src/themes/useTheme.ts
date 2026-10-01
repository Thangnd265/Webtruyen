import { createContext, useContext } from "react";
import { themes } from ".";
import type { ThemeMode } from "./types";

export type AppearanceOverrides = Partial<Record<"accentColor" | "fontScale" | "contentWidth" | "readerLineHeight", string>>;

export type ThemeContextValue = {
  themes: typeof themes;
  themeId: string;
  mode: ThemeMode;
  overrides: AppearanceOverrides;
  accentError: string | null;
  setThemeId: (id: string) => void;
  setMode: (mode: ThemeMode) => void;
  setOverride: (key: keyof AppearanceOverrides, value: string) => void;
  resetOverrides: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside ThemeProvider");
  return theme;
}
