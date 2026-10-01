import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("uses the approved Webtruyenv2 palette for the default dark mode", async () => {
  const css = await readFile(resolve("src/themes/default/theme.css"), "utf8");
  const dark = css.match(/\[data-theme="default"\]\[data-mode="dark"\]\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  expect(dark).toContain("--color-bg: #000000");
  expect(dark).toContain("--color-surface: #0d0d0d");
  expect(dark).toContain("--color-text: #e8e4e0");
  expect(dark).toContain("--color-muted: #a39e98");
  expect(dark).toContain("--color-accent: #d95a52");
  expect(dark).toContain("--color-accent-hover: #e8726a");
});
