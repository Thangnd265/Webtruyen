# Tiểu Thuyết Mạng UI Clone Design

## Goal

Build a responsive front-end clone of the public Tiểu Thuyết Mạng interface using mock data. The clone reproduces the site's visual hierarchy and main interactions without authentication, payments, content management, or other backend services.

## Scope

The application includes these public-facing screen templates:

- Home page with hero carousel, story shelves, ratings, and rankings.
- Story catalog and audio catalog with filters, sorting, and pagination.
- Search page with query, category filters, and empty/results states.
- Rankings page.
- Membership pricing page with non-functional checkout calls to action.
- Story detail page with information, chapter, audio, and comment tabs.
- Chapter reader with navigation and reading preferences.
- Audio reader with a mock player and playlist.
- About, contact, terms, and policy pages.

The header, responsive mobile menu, footer, theme picker, and personal appearance controls are shared across all screens.

## Technical Approach

Use React, TypeScript, and Vite. React Router provides client-side routes. Styling stays in plain CSS so theme plugins can override semantic variables without depending on a component framework. Icons use one consistent vector icon package; no emoji is used as a structural control.

Mock content is stored as local TypeScript data. Public cover-image URLs from the reference site may be used as sample content, with a gradient fallback when an image fails. No target-site API is called at runtime.

## Theme Plugin Contract

Themes are build-time plugins discovered with Vite's `import.meta.glob`. Adding a folder and rebuilding is the only installation workflow.

```text
src/themes/
├─ default/
│  ├─ theme.json
│  ├─ theme.css
│  └─ assets/
├─ midnight/
│  ├─ theme.json
│  ├─ theme.css
│  └─ assets/
└─ index.ts
```

Each `theme.json` follows this contract:

```json
{
  "id": "default",
  "name": "Tiểu Thuyết Mạng",
  "description": "Warm editorial light theme",
  "preview": "./assets/preview.webp",
  "modes": ["light", "dark"]
}
```

Each `theme.css` scopes its values to `[data-theme="<id>"]` and supplies the shared semantic variables:

```css
[data-theme="default"] {
  --color-bg: #fff8f6;
  --color-surface: #ffffff;
  --color-text: #2d1f1c;
  --color-muted: #6b5348;
  --color-border: rgb(229 77 66 / 12%);
  --color-accent: #e54d42;
  --color-accent-hover: #c43d33;
  --font-sans: "Nunito", system-ui, sans-serif;
  --radius-card: 12px;
  --shadow-card: 0 2px 12px rgb(45 31 28 / 8%);
  --density-scale: 1;
  --motion-fast: 150ms;
  --motion-normal: 250ms;
}
```

Dark mode is a selector inside the same plugin, `[data-theme="default"][data-mode="dark"]`. Components consume semantic variables only and never import a theme directly.

`ThemeProvider` exposes the discovered theme list, active theme, color mode, and personal overrides. The selected theme, mode, and override values are stored in `localStorage`. Personal controls may change accent color, font scale, content width, and reading line height; reset removes all overrides. Arbitrary user CSS or JavaScript uploads are intentionally excluded.

## Interface Architecture

The application has four small layers:

1. `app`: router and shared layout.
2. `components`: reusable header, footer, story cards, filters, tabs, modal, carousel, and player controls.
3. `pages`: route-level composition only.
4. `data` and `themes`: mock content and appearance plugins.

Story cards have compact, horizontal, and ranked variants built from one data contract. Catalog filtering is derived from URL search parameters so links remain shareable. Search, sorting, tab changes, pagination, carousel controls, reader preferences, and mock playback are handled locally.

## Routes

```text
/
/truyen
/truyen/audio
/truyen/search
/tim-kiem
/bang-xep-hang
/hoi-vien
/truyen/:slug
/truyen/:slug/doc/:chapter
/truyen/:slug/nghe/:chapter
/gioi-thieu
/lien-he
/dieu-khoan
/chinh-sach
```

Unknown routes render an in-brand 404 page with navigation back to the home page.

## Visual System

The default theme follows the reference site's warm editorial palette: warm off-white background, white surfaces, dark brown text, muted brown secondary text, and coral-red accent. Nunito is the primary typeface. Layout uses a 4/8px spacing rhythm, a maximum content width near 1200px, 12px cards, subtle shadows, and restrained 150–250ms transitions.

The clone preserves the reference hierarchy rather than pixel-copying brittle implementation details: sticky header, large feature hero, dense story shelves, two-column desktop content with a ranking sidebar, and stacked mobile content. Uiverse patterns may be adapted for zero-dependency polish on buttons, cards, search inputs, skeletons, and tooltips, but must use the theme variables and match the reference appearance.

## Responsive Behavior

- Below 768px: collapsed navigation, single-column lists, reduced hero height, and touch targets of at least 44px.
- From 768px: expanded navigation and multi-column catalog grids.
- From 1024px: ranking sidebar and wider horizontal story cards.
- Reader text remains in a constrained measure instead of stretching across large screens.

## Accessibility

- Semantic landmarks, headings, buttons, links, labels, and dialogs.
- Visible keyboard focus using the active accent token.
- Minimum 4.5:1 contrast for normal text in both modes.
- Decorative SVGs are hidden from assistive technology; icon-only controls receive accessible names.
- Carousel and player controls work with keyboard input.
- Motion is reduced under `prefers-reduced-motion`.
- Forms retain labels and display mock validation messages without relying on color alone.

## Error and Empty States

Broken cover images show a themed gradient fallback. Searches and filters show a clear empty state with a reset action. Invalid story or chapter slugs show the branded 404 state. The mock player exposes idle, playing, paused, locked, and completed visual states without requesting media.

## Verification

One focused test suite covers route rendering, catalog filtering, theme discovery, theme persistence, and personal override reset. Production verification includes TypeScript checking, the test command, and a Vite production build. Visual review covers 375px and 1440px widths, light and dark modes, keyboard navigation, reduced motion, and the main page templates.

## Explicit Non-Goals

- No backend, database, authentication, payments, uploads, or admin panel.
- No scraping or live synchronization with the reference site.
- No arbitrary runtime theme uploads or executable third-party theme code.
- No separate React component tree per theme; layout variants can be added later only if CSS tokens and selectors prove insufficient.
