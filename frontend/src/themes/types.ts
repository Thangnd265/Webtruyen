export type ThemeMode = "light" | "dark";

export type ThemeManifest = {
  id: string;
  name: string;
  description: string;
  preview?: string;
  modes: ThemeMode[];
};
