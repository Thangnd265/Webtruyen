# Tiểu Thuyết Mạng UI Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive React clone of the public Tiểu Thuyết Mạng interface with mock interactions and build-time theme plugins.

**Architecture:** A Vite React single-page app composes shared layout components and route-level pages from typed local mock data. Theme folders are discovered at build time with `import.meta.glob`; scoped CSS variables drive every visual component while user overrides persist in `localStorage`.

**Tech Stack:** React, TypeScript, Vite, React Router, Vitest, Testing Library, plain CSS, Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-29-tieuthuyetmang-ui-clone-design.md`

## Global Constraints

- Front-end and mock data only; no backend, authentication, payments, uploads, scraping, or live target-site API calls.
- Theme installation is build-time only: `theme.json`, scoped `theme.css`, and optional assets in one theme directory.
- Components consume semantic CSS variables and never import a concrete theme.
- All controls remain keyboard accessible, normal text reaches 4.5:1 contrast, and reduced motion is respected.
- Verify layouts at 375px and 1440px in both light and dark modes.
- Preserve unrelated changes already present in the parent repository.

---

### Task 1: Application Foundation and Theme Discovery

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/themes/types.ts`
- Create: `src/themes/index.ts`
- Create: `src/themes/default/theme.json`
- Create: `src/themes/default/theme.css`
- Create: `src/themes/midnight/theme.json`
- Create: `src/themes/midnight/theme.css`
- Create: `src/test/setup.ts`
- Create: `src/app.test.tsx`

**Interfaces:**
- Produces: `ThemeManifest { id, name, description, preview?, modes }`.
- Produces: `themes: ThemeManifest[]` sorted by name and loaded through `import.meta.glob`.
- Produces: npm scripts `dev`, `build`, `test`, and `typecheck`.

- [ ] **Step 1: Create the minimum Vite/React test harness**

```json
{
  "name": "tieuthuyetmang-ui-clone",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "typecheck": "tsc -b --pretty false"
  },
  "dependencies": {
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

Configure `vite.config.ts` with the React plugin and a `jsdom` test environment loading `src/test/setup.ts`. Configure strict TypeScript with `noEmit`, DOM libraries, JSX `react-jsx`, and Vite client types.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits 0.

- [ ] **Step 3: Write the failing theme discovery test**

```tsx
import { describe, expect, it } from "vitest";
import { themes } from "./themes";

describe("theme plugins", () => {
  it("discovers default and midnight manifests", () => {
    expect(themes.map((theme) => theme.id)).toEqual(["default", "midnight"]);
    expect(themes.every((theme) => theme.modes.includes("dark"))).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because `src/themes/index.ts` does not exist.

- [ ] **Step 5: Implement theme discovery and base manifests**

```ts
// src/themes/types.ts
export type ThemeMode = "light" | "dark";

export type ThemeManifest = {
  id: string;
  name: string;
  description: string;
  preview?: string;
  modes: ThemeMode[];
};
```

```ts
// src/themes/index.ts
import type { ThemeManifest } from "./types";

const manifests = import.meta.glob<ThemeManifest>("./*/theme.json", {
  eager: true,
  import: "default",
});

import.meta.glob("./*/theme.css", { eager: true });

export const themes = Object.values(manifests).sort((a, b) =>
  a.id === "default" ? -1 : b.id === "default" ? 1 : a.name.localeCompare(b.name),
);
```

Add both manifests with IDs `default` and `midnight`, names, descriptions, and `modes: ["light", "dark"]`. Define the semantic tokens from the spec in each scoped CSS file, including the corresponding `[data-mode="dark"]` block.

- [ ] **Step 6: Run the test and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: 1 test passes.

- [ ] **Step 7: Commit the foundation**

```bash
git add Webtruyen/package.json Webtruyen/package-lock.json Webtruyen/index.html Webtruyen/tsconfig.json Webtruyen/vite.config.ts Webtruyen/src
git commit -m "feat(webtruyen): add themed Vite foundation"
```

---

### Task 2: Theme Provider and Personal Appearance Overrides

**Files:**
- Create: `src/themes/ThemeProvider.tsx`
- Create: `src/themes/useTheme.ts`
- Create: `src/components/ThemePanel.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Produces: `ThemeProvider` wrapping the application.
- Produces: `useTheme(): { themes, themeId, mode, overrides, setThemeId, setMode, setOverride, resetOverrides }`.
- Persists under the single key `ttm-appearance`.

- [ ] **Step 1: Add a failing persistence/reset test**

```tsx
function ThemeProbe() {
  const theme = useTheme();
  return (
    <>
      <output>{theme.themeId}:{theme.mode}:{theme.overrides.fontScale ?? 1}</output>
      <button onClick={() => theme.setThemeId("midnight")}>Theme</button>
      <button onClick={() => theme.setOverride("fontScale", "1.1")}>Scale</button>
      <button onClick={theme.resetOverrides}>Reset</button>
    </>
  );
}

it("persists theme and resets personal overrides", async () => {
  render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
  await userEvent.click(screen.getByText("Theme"));
  await userEvent.click(screen.getByText("Scale"));
  expect(JSON.parse(localStorage.getItem("ttm-appearance")!)).toMatchObject({ themeId: "midnight" });
  await userEvent.click(screen.getByText("Reset"));
  expect(screen.getByRole("status")).toHaveTextContent("midnight:light:1");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because `ThemeProvider` and `useTheme` do not exist.

- [ ] **Step 3: Implement one context and one storage record**

Use lazy state initialization to parse `ttm-appearance`, falling back to `{ themeId: "default", mode: "light", overrides: {} }`. On state change, update `document.documentElement.dataset.theme`, `dataset.mode`, the four allowed inline variables (`--color-accent`, `--font-scale`, `--content-width`, `--reader-line-height`), and `localStorage`. Validate a stored `themeId` against `themes` before applying it.

Create `ThemePanel` as an accessible dialog containing theme cards, light/dark buttons, native color/range controls, and a reset button. Reuse the discovered manifests rather than maintaining a second theme list.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: both theme tests pass.

- [ ] **Step 5: Commit theme behavior**

```bash
git add Webtruyen/src/themes Webtruyen/src/components/ThemePanel.tsx Webtruyen/src/main.tsx Webtruyen/src/app.test.tsx
git commit -m "feat(webtruyen): add theme plugin selection"
```

---

### Task 3: Mock Data and Catalog Filtering

**Files:**
- Create: `src/data/types.ts`
- Create: `src/data/stories.ts`
- Create: `src/data/site.ts`
- Create: `src/data/catalog.ts`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Produces: `Story { id, slug, title, author, cover, category, tags, status, chapters, views, rating, hasAudio, description, updatedAt }`.
- Produces: `filterStories(stories, filters): Story[]` where filters include `query`, `category`, `status`, `minimumChapters`, `audioOnly`, and `sort`.
- Produces: hero slides, comments, rankings, membership plans, chapters, and navigation groups.

- [ ] **Step 1: Write the failing catalog behavior test**

```ts
it("filters catalog values and sorts without mutating source data", () => {
  const source = stories.slice();
  const result = filterStories(stories, {
    query: "nữ thần",
    category: "Học Đường",
    status: "ongoing",
    minimumChapters: 50,
    audioOnly: false,
    sort: "views",
  });
  expect(result.every((story) => story.category === "Học Đường" && story.chapters >= 50)).toBe(true);
  expect(stories).toEqual(source);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because the data modules do not exist.

- [ ] **Step 3: Add representative Vietnamese mock content and minimal filtering**

Create 16–20 stories covering the visible reference categories and states, including audio and non-audio entries. `filterStories` copies before sorting, normalizes query text with `toLocaleLowerCase("vi")`, applies only supplied filters, and supports `new`, `views`, `rating`, and `featured` sort values.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: the catalog test passes and earlier tests remain green.

- [ ] **Step 5: Commit mock data**

```bash
git add Webtruyen/src/data Webtruyen/src/app.test.tsx
git commit -m "feat(webtruyen): add mock story catalog"
```

---

### Task 4: Shared Shell, Routing, and Reusable Components

**Files:**
- Create: `src/App.tsx`
- Create: `src/app/router.tsx`
- Create: `src/styles/base.css`
- Create: `src/styles/components.css`
- Create: `src/components/Icon.tsx`
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`
- Create: `src/components/Layout.tsx`
- Create: `src/components/StoryCard.tsx`
- Create: `src/components/StoryGrid.tsx`
- Create: `src/components/Carousel.tsx`
- Create: `src/components/FilterPanel.tsx`
- Create: `src/components/Pagination.tsx`
- Create: `src/components/Modal.tsx`
- Create: `src/pages/NotFoundPage.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Produces: `AppRouter` with every route from the spec.
- Produces: `StoryCard` variants `horizontal | compact | ranked`.
- Produces: accessible shared navigation, modal, carousel, filters, and pagination.

- [ ] **Step 1: Write failing shell and unknown-route tests**

```tsx
it("renders shared navigation and a branded unknown route", () => {
  render(<MemoryRouter initialEntries={["/missing"]}><App /></MemoryRouter>);
  expect(screen.getByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /không tìm thấy/i })).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because `App` does not exist.

- [ ] **Step 3: Implement the shared shell and route placeholders**

Build a sticky header with desktop navigation, search, theme button, mock account button, and mobile menu. Build the four-column footer from mock navigation data. Add semantic `main`, a branded 404 route, focus styles, 44px minimum compact control size, and reduced-motion rules.

Create small page placeholders for all named routes so the routing contract is complete before detailed page composition. Use Lucide icons through direct imports; `Icon` standardizes sizes and `aria-hidden` behavior for decorative glyphs.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: shared shell test passes.

- [ ] **Step 5: Commit routing and components**

```bash
git add Webtruyen/src
git commit -m "feat(webtruyen): add responsive app shell"
```

---

### Task 5: Home, Catalog, Search, Rankings, and Membership Pages

**Files:**
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/CatalogPage.tsx`
- Create: `src/pages/SearchPage.tsx`
- Create: `src/pages/RankingsPage.tsx`
- Create: `src/pages/MembershipPage.tsx`
- Create: `src/components/RankingList.tsx`
- Create: `src/components/RatingFeed.tsx`
- Create: `src/components/PricingCard.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/styles/components.css`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Consumes: `filterStories`, mock site data, and shared components.
- Produces: reference-aligned discovery routes with URL-backed filters.

- [ ] **Step 1: Write failing discovery-page behavior tests**

```tsx
it("filters the catalog from user controls and exposes the empty reset action", async () => {
  render(<MemoryRouter initialEntries={["/truyen"]}><App /></MemoryRouter>);
  await userEvent.type(screen.getByRole("searchbox", { name: /tìm trong kho/i }), "không tồn tại");
  expect(screen.getByText(/không tìm thấy truyện/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /xóa bộ lọc/i }));
  expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
});

it("shows all three membership plans", () => {
  render(<MemoryRouter initialEntries={["/hoi-vien"]}><App /></MemoryRouter>);
  expect(screen.getAllByRole("article")).toHaveLength(3);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because route placeholders lack the required content and behavior.

- [ ] **Step 3: Implement discovery pages**

Compose the home page with a 400–500px hero, dot/arrow controls, audio section, updated stories, editor picks, rating feed, and sticky desktop ranking sidebar. Catalog and audio routes share `CatalogPage`; audio supplies `audioOnly: true`. Keep filters in `URLSearchParams` and render a resettable empty state. Search reuses the same result grid. Rankings display tabular top-story and member lists. Membership renders three themed pricing cards whose actions open the mock sign-in modal.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: all discovery tests pass.

- [ ] **Step 5: Commit discovery pages**

```bash
git add Webtruyen/src
git commit -m "feat(webtruyen): build discovery pages"
```

---

### Task 6: Story Detail, Chapter Reader, and Mock Audio Player

**Files:**
- Create: `src/pages/StoryPage.tsx`
- Create: `src/pages/ReaderPage.tsx`
- Create: `src/pages/AudioPage.tsx`
- Create: `src/components/Tabs.tsx`
- Create: `src/components/ReaderToolbar.tsx`
- Create: `src/components/AudioPlayer.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/styles/components.css`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Consumes: story, chapter, comment, and appearance data.
- Produces: tabbed story detail, chapter navigation, reader controls, and deterministic mock playback state.

- [ ] **Step 1: Write failing detail/reader/player tests**

```tsx
it("switches story tabs and opens the chapter reader", async () => {
  render(<MemoryRouter initialEntries={["/truyen/biet-the-da-khong-choi-nhu-vay"]}><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("tab", { name: /chap/i }));
  expect(screen.getByRole("link", { name: /chương 1/i })).toHaveAttribute("href", expect.stringContaining("/doc/1"));
});

it("toggles mock audio playback without requesting media", async () => {
  render(<MemoryRouter initialEntries={["/truyen/co-vo-benh-kieu-may-moc-cua-toi/nghe/1"]}><App /></MemoryRouter>);
  const play = screen.getByRole("button", { name: /phát/i });
  await userEvent.click(play);
  expect(screen.getByRole("button", { name: /tạm dừng/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because route placeholders do not provide tabs or playback.

- [ ] **Step 3: Implement the three reading experiences**

Story detail includes cover, metadata, membership callout, description, tags, rating summary, tabs for information/chapters/audio/comments, and recommendations. Reader includes previous/next navigation, chapter picker, constrained article measure, font-size and line-height controls, report actions, and a back-to-top control. Audio uses local component state for play/pause, seek position, speed, volume, and playlist selection; it never creates a networked `Audio` source.

Invalid story or chapter parameters reuse `NotFoundPage`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: all detail, reader, and audio tests pass.

- [ ] **Step 5: Commit reading pages**

```bash
git add Webtruyen/src
git commit -m "feat(webtruyen): add story reading experiences"
```

---

### Task 7: Informational Pages and Final Visual Polish

**Files:**
- Create: `src/pages/InfoPage.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/styles/base.css`
- Modify: `src/styles/components.css`
- Modify: `src/themes/default/theme.css`
- Modify: `src/themes/midnight/theme.css`
- Modify: `src/app.test.tsx`

**Interfaces:**
- Produces: accessible about, contact, terms, and policy routes.
- Completes: responsive behavior and theme parity for every page template.

- [ ] **Step 1: Write the final route coverage test**

```tsx
it.each([
  ["/gioi-thieu", "Giới thiệu"],
  ["/lien-he", "Liên hệ"],
  ["/dieu-khoan", "Điều khoản"],
  ["/chinh-sach", "Chính sách"],
])("renders %s", (route, heading) => {
  render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL until the informational pages replace their placeholders.

- [ ] **Step 3: Implement informational content and responsive CSS**

Use one `InfoPage` component with explicit page content supplied by the router. Finish 375px, 768px, 1024px, and 1440px layout rules; line clamps; image fallbacks; theme panel; focus states; Uiverse-inspired button/card/input hover states rewritten against semantic tokens; and `prefers-reduced-motion` overrides.

- [ ] **Step 4: Run the complete automated verification**

Run: `npm test`

Expected: all tests pass with 0 failures.

Run: `npm run typecheck`

Expected: TypeScript exits 0 with no diagnostics.

Run: `npm run build`

Expected: Vite exits 0 and creates `dist/`.

- [ ] **Step 5: Perform visual verification**

Run: `npm run dev -- --host 127.0.0.1`

Verify in the browser:

- Home, catalog, story, reader, audio, rankings, membership, search, and informational templates.
- 375px and 1440px widths.
- Default and Midnight themes in light and dark modes.
- Keyboard navigation, focus visibility, mobile menu, theme dialog, carousel, tabs, filter reset, and mock player.
- Reduced-motion behavior and no horizontal overflow.

- [ ] **Step 6: Commit the completed interface**

```bash
git add Webtruyen
git commit -m "feat(webtruyen): complete responsive UI clone"
```

---

## Plan Self-Review

- Every route and non-goal in the approved spec maps to a task above.
- The theme manifest, context, storage key, CSS selectors, and override names remain consistent across tasks.
- Production behavior is introduced only after a focused failing test.
- Dependencies are limited to the framework, router, icons, and test/build tooling required by the requested application.
