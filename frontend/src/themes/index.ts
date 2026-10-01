import type { ThemeManifest } from "./types";

const manifests = import.meta.glob<ThemeManifest>("./*/theme.json", {
  eager: true,
  import: "default",
});

import.meta.glob("./*/theme.css", { eager: true });

export const themes = Object.values(manifests).sort((a, b) =>
  a.id === "default" ? -1 : b.id === "default" ? 1 : a.name.localeCompare(b.name),
);
