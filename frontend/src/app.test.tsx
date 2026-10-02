import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { themes } from "./themes";
import { ThemeProvider } from "./themes/ThemeProvider";
import { useTheme } from "./themes/useTheme";
import { ThemePanel } from "./components/ThemePanel";
import { stories } from "./data/stories";
import { filterStories } from "./data/catalog";
import { heroSlides } from "./data/site";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { App } from "./App";
import { Carousel } from "./components/Carousel";
import { FilterPanel } from "./components/FilterPanel";
import { Pagination } from "./components/Pagination";
import { StoryGrid } from "./components/StoryGrid";
import { useState } from "react";
import type { StoryFilters } from "./data/catalog";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function ThemeProbe() {
  const theme = useTheme();
  return (
    <>
      <output role="status">{theme.themeId}:{theme.mode}:{theme.overrides.fontScale ?? 1}</output>
      <button onClick={() => theme.setThemeId("midnight")}>Theme</button>
      <button onClick={() => theme.setOverride("fontScale", "1.1")}>Scale</button>
      <button onClick={theme.resetOverrides}>Reset</button>
    </>
  );
}

describe("theme plugins", () => {
  it("discovers default and midnight manifests", () => {
    expect(themes.map((theme) => theme.id)).toEqual(["default", "midnight"]);
    expect(themes.every((theme) => theme.modes.includes("dark"))).toBe(true);
  });
});

it("persists theme and resets personal overrides", async () => {
  render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
  await userEvent.click(screen.getByText("Theme"));
  await userEvent.click(screen.getByText("Scale"));
  expect(JSON.parse(localStorage.getItem("ttm-appearance")!)).toMatchObject({ themeId: "midnight" });
  await userEvent.click(screen.getByText("Reset"));
  expect(screen.getByRole("status")).toHaveTextContent("midnight:light:1");
});

it("leaves the selected theme card's focus outline available", async () => {
  localStorage.removeItem("ttm-appearance");
  render(<ThemeProvider><ThemePanel /></ThemeProvider>);
  const selected = screen.getByRole("button", { name: /Người Yêu Cũ/ });
  selected.focus();
  expect(selected).toHaveFocus();
  expect(selected).toHaveAttribute("aria-pressed", "true");
  expect(selected.style.outline).toBe("");
});

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
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((story) => story.category === "Học Đường" && story.chapters >= 50)).toBe(true);
  expect(stories).toEqual(source);
});

it("renders shared navigation and a branded unknown route", () => {
  render(<MemoryRouter initialEntries={["/missing"]}><App /></MemoryRouter>);
  expect(screen.getByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /không tìm thấy/i })).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();
});

it.each([
  ["/gioi-thieu", "Giới thiệu"], ["/lien-he", "Liên hệ"], ["/dieu-khoan", "Điều khoản"], ["/chinh-sach", "Chính sách"],
])("renders informational content for %s", (path, heading) => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  const article = screen.getByRole("article", { name: heading });
  expect(within(article).getByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
  expect(within(article).getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
});

it("validates contact fields locally and retains the draft after mock submission", async () => {
  render(<MemoryRouter initialEntries={["/lien-he"]}><App /></MemoryRouter>);
  const name = screen.getByRole("textbox", { name: "Họ và tên" });
  const email = screen.getByRole("textbox", { name: "Email" });
  const message = screen.getByRole("textbox", { name: "Nội dung" });
  await userEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn mẫu" }));
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(name).toHaveAttribute("aria-invalid", "true");
  await userEvent.type(name, "   ");
  await userEvent.type(email, "invalid");
  await userEvent.type(message, "   ");
  await userEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn mẫu" }));
  expect(email).toHaveAttribute("aria-invalid", "true");
  expect(message).toHaveAttribute("aria-invalid", "true");
  await userEvent.type(name, "Mai");
  await userEvent.clear(email);
  await userEvent.type(email, "mai@example.com");
  await userEvent.type(message, "Tôi muốn góp ý về giao diện.");
  await userEvent.click(screen.getByRole("button", { name: "Gửi tin nhắn mẫu" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/chưa được gửi/i);
  expect(message).toHaveValue("   Tôi muốn góp ý về giao diện.");
});

it("reflects theme accent changes and restores the active swatch after reset", async () => {
  localStorage.removeItem("ttm-appearance");
  // JSDOM does not load Vite CSS: provide computed theme tokens at this boundary.
  const style = document.createElement("style");
  style.textContent = '[data-theme="default"] { --color-accent: #cc4439; --color-bg: #fff8f6; --color-surface: #ffffff; } [data-theme="midnight"] { --color-accent: #4c4f9d; --color-bg: #f3f5fb; --color-surface: #ffffff; } [data-theme="midnight"][data-mode="dark"] { --color-accent: #a9b2ff; --color-bg: #121827; --color-surface: #1c2538; }';
  document.head.append(style);
  try {
    render(<ThemeProvider><ThemePanel /></ThemeProvider>);
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#cc4439");
    await userEvent.click(screen.getByRole("button", { name: /Midnight/ }));
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#4c4f9d");
    await userEvent.click(screen.getByRole("button", { name: "Tối" }));
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#a9b2ff");
    fireEvent.change(screen.getByLabelText("Màu nhấn"), { target: { value: "#d4ddff" } });
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#d4ddff");
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại tùy chỉnh" }));
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#a9b2ff");
  } finally { style.remove(); localStorage.removeItem("ttm-appearance"); }
});

describe("personal accent accessibility", () => {
  function setup(storedAccent?: string) {
    localStorage.setItem("ttm-appearance", JSON.stringify({ themeId: "default", mode: "light", overrides: storedAccent ? { accentColor: storedAccent } : {} }));
    const style = document.createElement("style");
    style.dataset.testTheme = "true";
    style.textContent = '[data-theme="default"] { --color-accent: #c94338; --color-bg: #fff8f6; --color-surface: #ffffff; } [data-theme="default"][data-mode="dark"] { --color-accent: #ff8174; --color-bg: #1d1716; --color-surface: #2c2220; }';
    document.head.append(style);
    render(<ThemeProvider><ThemePanel /></ThemeProvider>);
  }
  afterEach(() => { document.querySelector('[data-test-theme]')?.remove(); localStorage.removeItem("ttm-appearance"); });

  it("rejects unreadable personal accents and updates every coupled token for valid colors", () => {
    setup();
    // White fails outright; coral fails 4.5:1; the last color passes white but fails warm background.
    for (const value of ["#ffffff", "#e54d42", "#cc4439"]) {
      fireEvent.change(screen.getByLabelText("Màu nhấn"), { target: { value } });
      expect(screen.getByRole("alert")).toHaveTextContent(/tương phản/i);
      expect(JSON.parse(localStorage.getItem("ttm-appearance")!).overrides.accentColor).toBeUndefined();
    }
    fireEvent.change(screen.getByLabelText("Màu nhấn"), { target: { value: "#005500" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#005500");
    expect(document.documentElement.style.getPropertyValue("--color-accent-hover")).toBe("#005500");
    expect(document.documentElement.style.getPropertyValue("--color-on-accent")).toBe("#ffffff");
  });

  it("validates persisted colors before applying them", () => {
    setup("#ffffff");
    expect(screen.getByRole("alert")).toHaveTextContent(/tương phản/i);
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("");
    expect(JSON.parse(localStorage.getItem("ttm-appearance")!).overrides.accentColor).toBeUndefined();
  });

  it("rechecks the color when switching mode and resets coupled overrides", async () => {
    setup("#005500");
    await userEvent.click(screen.getByRole("button", { name: "Tối" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/tương phản/i);
    expect(screen.getByLabelText("Màu nhấn")).toHaveValue("#ff8174");
    fireEvent.change(screen.getByLabelText("Màu nhấn"), { target: { value: "#ffffff" } });
    expect(document.documentElement.style.getPropertyValue("--color-on-accent")).toBe("#000000");
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại tùy chỉnh" }));
    expect(document.documentElement.style.getPropertyValue("--color-accent-hover")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--color-on-accent")).toBe("");
  });
});

it("collapses the expanded chapter list when navigating to another story", async () => {
  render(<MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi"]}><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("tab", { name: "Chương" }));
  await userEvent.click(screen.getByRole("button", { name: "Xem tất cả chương" }));
  expect(screen.getByRole("link", { name: "Chương 13" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("link", { name: "Nữ Thần Thanh Xuân" }));
  await userEvent.click(screen.getByRole("tab", { name: "Chương" }));
  expect(screen.queryByRole("link", { name: "Chương 13" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem tất cả chương" })).toHaveAttribute("aria-expanded", "false");
});

it("switches story tabs and opens the chapter reader", async () => {
  render(<MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi"]}><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("tab", { name: /chương/i }));
  expect(screen.getByRole("link", { name: "Chương 1" })).toHaveAttribute("href", "/truyen/nu-than-cua-lop-toi/doc/1");
  await userEvent.click(screen.getByRole("button", { name: /xem tất cả chương/i }));
  expect(screen.getByRole("link", { name: "Chương 13" })).toHaveAttribute("href", "/truyen/nu-than-cua-lop-toi/doc/13");
});

it("navigates chapters and adjusts reading preferences", async () => {
  render(<ThemeProvider><MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi/doc/1"]}><App /></MemoryRouter></ThemeProvider>);
  expect(screen.getByRole("heading", { name: /chương 1/i })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Chương sau" })[0]).toHaveAttribute("href", "/truyen/nu-than-cua-lop-toi/doc/2");
  await userEvent.click(screen.getByRole("button", { name: /tăng cỡ chữ/i }));
  expect(JSON.parse(localStorage.getItem("ttm-appearance")!).overrides.fontScale).toBe("1.1");
});

it("toggles mock audio playback and changes playlist selection without media", async () => {
  const audio = vi.fn();
  vi.stubGlobal("Audio", audio);
  render(<MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi/nghe/1"]}><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: /^phát$/i }));
  expect(screen.getByRole("button", { name: /tạm dừng/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /chương 2/i }));
  expect(screen.getByRole("heading", { name: /chương 2/i })).toBeInTheDocument();
  expect(audio).not.toHaveBeenCalled();
  expect(document.querySelector("audio")).toBeNull();
});

it.each([
  "/truyen/khong-co-truyen",
  "/truyen/nu-than-cua-lop-toi/doc/0",
  "/truyen/nu-than-cua-lop-toi/doc/87",
  "/truyen/nu-than-cua-lop-toi/doc/nope",
  "/truyen/nu-than-thanh-xuan/nghe/1",
])("shows the branded 404 for an invalid reading route %s", (path) => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /không tìm thấy/i })).toBeInTheDocument();
});

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

it("keeps catalog filters in the URL", async () => {
  function Location() { return <output data-testid="location">{useLocation().search}</output>; }
  render(<MemoryRouter initialEntries={["/truyen"]}><App /><Location /></MemoryRouter>);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Thể loại" }), "Học Đường");
  expect(screen.getByTestId("location")).toHaveTextContent("category=H%E1%BB%8Dc");
});

it("shows only audio stories on the audio route", () => {
  render(<MemoryRouter initialEntries={["/truyen/audio"]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Truyện audio" })).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(stories.filter((story) => story.hasAudio).length);
});

it("opens the mock sign-in dialog from a membership plan", async () => {
  render(<MemoryRouter initialEntries={["/hoi-vien"]}><App /></MemoryRouter>);
  await userEvent.click(screen.getAllByRole("button", { name: /chọn gói/i })[0]);
  expect(screen.getByRole("dialog", { name: /tài khoản mẫu/i })).toBeInTheDocument();
});

it("switches ranking lists with keyboard accessible tabs", async () => {
  render(<MemoryRouter initialEntries={["/bang-xep-hang"]}><App /></MemoryRouter>);
  const members = screen.getByRole("tab", { name: "Thành viên" });
  await userEvent.click(members);
  expect(members).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveTextContent("Mây Nhỏ");
});

it("opens mobile navigation and the appearance panel", async () => {
  render(<ThemeProvider><MemoryRouter><App /></MemoryRouter></ThemeProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
  expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Tùy chỉnh giao diện" }));
  expect(screen.getByRole("dialog", { name: "Giao diện đọc truyện" })).toBeInTheDocument();
});

it("closes mobile navigation when the viewport becomes desktop sized", async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
  expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument();
  vi.stubGlobal("innerWidth", 1200);
  fireEvent.resize(window);
  expect(screen.queryByRole("navigation", { name: "Điều hướng di động" })).not.toBeInTheDocument();
});

it("cycles through feature slides with named buttons", async () => {
  const { container } = render(<MemoryRouter><Carousel slides={heroSlides} stories={stories} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: heroSlides[0].title })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Trang tiếp" }));
  expect(screen.getByRole("heading", { name: heroSlides[1].title })).toBeInTheDocument();
  expect(container.querySelector(".hero-image")).toHaveClass("hero-image-enter");
});

it("renders the homepage carousel as a full-bleed poster with story metadata", () => {
  const { container } = render(<MemoryRouter><Carousel slides={heroSlides} stories={stories} /></MemoryRouter>);
  const hero = container.querySelector(".hero-carousel");
  const story = stories.find((entry) => entry.id === heroSlides[0].storyId)!;
  expect(hero).toHaveClass("hero-carousel-full-bleed");
  expect(container.querySelector(".hero-meta")).toHaveTextContent(`Tác giả: ${story.author}`);
  expect(container.querySelector(".hero-meta")).toHaveTextContent(`${story.chapters} chương`);
  expect(container.querySelector<HTMLImageElement>(".hero-image")?.src).toContain("w=1600");
});

it("shows the next feature image after a broken cover", async () => {
  const { container } = render(<MemoryRouter><Carousel slides={heroSlides} stories={stories} /></MemoryRouter>);
  const image = container.querySelector<HTMLImageElement>(".hero-image")!;
  fireEvent.error(image);
  expect(image).toHaveStyle({ display: "none" });
  await userEvent.click(screen.getByRole("button", { name: "Trang tiếp" }));
  expect(container.querySelector(".hero-image")).not.toHaveStyle({ display: "none" });
});

it("keeps a valid slide when the slide list shrinks", async () => {
  const { rerender } = render(<MemoryRouter><Carousel slides={heroSlides} stories={stories} /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Trang tiếp" }));
  await userEvent.click(screen.getByRole("button", { name: "Trang tiếp" }));
  expect(screen.getByRole("heading", { name: heroSlides[2].title })).toBeInTheDocument();
  rerender(<MemoryRouter><Carousel slides={heroSlides.slice(0, 1)} stories={stories} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: heroSlides[0].title })).toBeInTheDocument();
});

it("keeps filter and pagination changes visible", async () => {
  function Controls() {
    const [filters, setFilters] = useState<StoryFilters>({});
    const [page, setPage] = useState(1);
    return <><FilterPanel filters={filters} onChange={setFilters} categories={["Học Đường"]} /><output>{filters.category ?? "Tất cả"}</output><Pagination page={page} totalPages={3} onPageChange={setPage} /><output>Trang {page}</output></>;
  }
  render(<Controls />);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Thể loại" }), "Học Đường");
  await userEvent.click(screen.getByRole("button", { name: "Trang tiếp" }));
  expect(screen.getByText("Học Đường", { selector: "output" })).toBeInTheDocument();
  expect(screen.getByText("Trang 2", { selector: "output" })).toBeInTheDocument();
});

it("links story cards to the matching story", () => {
  render(<MemoryRouter><StoryGrid stories={stories.slice(0, 2)} variant="compact" /></MemoryRouter>);
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByRole("link", { name: stories[0].title })).toHaveAttribute("href", `/truyen/${stories[0].slug}`);
});

describe("final review flows", () => {
  afterEach(() => localStorage.removeItem("ttm-appearance"));

  it("locks the sample audio chapter and keeps unlocked chapters playable", async () => {
    render(<MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi/nghe/3"]}><App /></MemoryRouter>);
    expect(screen.getByRole("status", { name: "Trạng thái phát" })).toHaveTextContent(/đang khóa/i);
    expect(screen.getByRole("button", { name: "Phát" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: /Tiến độ chương/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Chương 2" }));
    expect(screen.getByRole("button", { name: "Phát" })).toBeEnabled();
  });

  it("stops and announces completed mock audio and permits replay", async () => {
    render(<MemoryRouter initialEntries={["/truyen/nu-than-cua-lop-toi/nghe/1"]}><App /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Phát" }));
    fireEvent.change(screen.getByRole("slider", { name: /Tiến độ chương/ }), { target: { value: "100" } });
    expect(screen.queryByRole("button", { name: "Tạm dừng" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Trạng thái phát" })).toHaveTextContent(/hoàn thành/i);
    await userEvent.click(screen.getByRole("button", { name: "Nghe lại" }));
    expect(screen.getByRole("slider", { name: /Tiến độ chương/ })).toHaveValue("0");
    expect(screen.getByRole("button", { name: "Tạm dừng" })).toBeInTheDocument();
  });

  it("moves focus into appearance, handles native cancel, and restores its trigger", async () => {
    render(<ThemeProvider><MemoryRouter><App /></MemoryRouter></ThemeProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Mở menu" }));
    const trigger = screen.getByRole("button", { name: "Tùy chỉnh giao diện" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Giao diện đọc truyện" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    screen.getByRole("button", { name: "Đặt lại tùy chỉnh" }).focus();
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "Giao diện đọc truyện" })).not.toBeInTheDocument();
  });

  it("toggles light and dark mode using ThemeToggleSwitch", async () => {
    render(<ThemeProvider><MemoryRouter><App /></MemoryRouter></ThemeProvider>);
    const toggle = screen.getByRole("switch", { name: "Chuyển chế độ sáng/tối" });
    expect(toggle).toBeInTheDocument();
    const wasChecked = (toggle as HTMLInputElement).checked;
    await userEvent.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(!wasChecked);
  });

  it.each(["1.5", "NaN", "Infinity", "-2", "0"])("uses a real page for invalid catalog page %s", (page) => {
    render(<MemoryRouter initialEntries={[`/truyen?page=${page}`]}><App /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Trang 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Nữ Thần Của Lớp Tôi" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(8);
  });

  it("replaces live filter history so Back leaves the search in one step", async () => {
    function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Quay lại</button>; }
    render(<MemoryRouter initialEntries={["/gioi-thieu", "/tim-kiem"]}><App /><Back /></MemoryRouter>);
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong kho" }), "nữ thần");
    await userEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(screen.getByRole("heading", { name: "Giới thiệu", level: 1 })).toBeInTheDocument();
  });

  it("displays the actual default reader width and line spacing", () => {
    localStorage.removeItem("ttm-appearance");
    render(<ThemeProvider><ThemePanel /></ThemeProvider>);
    expect(screen.getByRole("slider", { name: "Độ rộng nội dung: 860 px" })).toHaveValue("860");
    expect(screen.getByRole("slider", { name: "Giãn dòng: 1.8" })).toHaveValue("1.8");
  });

  it.each([false, true])("honors a single-mode manifest when stored=%s", async (stored) => {
    const midnight = themes.find((theme) => theme.id === "midnight")!;
    const modes = midnight.modes;
    midnight.modes = ["dark"];
    function UnsupportedMode() { const { setMode } = useTheme(); return <button onClick={() => setMode("light")}>Request unsupported mode</button>; }
    localStorage.setItem("ttm-appearance", JSON.stringify({ themeId: stored ? "midnight" : "default", mode: "light", overrides: {} }));
    try {
      render(<ThemeProvider><ThemePanel /><UnsupportedMode /></ThemeProvider>);
      if (!stored) await userEvent.click(screen.getByRole("button", { name: /Midnight/ }));
      expect(screen.queryByRole("button", { name: "Sáng" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tối" })).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(screen.getByRole("button", { name: "Request unsupported mode" }));
      expect(document.documentElement.dataset.mode).toBe("dark");
      expect(JSON.parse(localStorage.getItem("ttm-appearance")!).mode).toBe("dark");
    } finally { cleanup(); midnight.modes = modes; }
  });
});
