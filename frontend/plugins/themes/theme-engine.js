/**
 * Theme Engine - Plugin Architecture for Synced Web Reader
 * Quản lý nạp động, chuyển đổi và đăng ký các Theme Plugin độc lập.
 */
class ThemeEngine {
  constructor() {
    this.themes = new Map();
    this.currentThemeId = 'tieuthuyetmang-dark';
    this.storageKey = 'audioweb-theme';
    this.customThemeKey = 'audioweb-custom-theme';

    this.registerBuiltinThemes();

    // Khởi tạo ngay theme đã lưu để tránh giật giao diện (flash of unstyled theme)
    try {
      const savedId = localStorage.getItem(this.storageKey) || 'tieuthuyetmang-dark';
      if (this.themes.has(savedId)) {
        this.apply(savedId);
      }
    } catch (_) {}
  }

  registerBuiltinThemes() {
    this.register({
      id: 'tieuthuyetmang-dark',
      name: 'Tiểu Thuyết Mạng (Dark Gốc)',
      type: 'dark',
      author: 'Tieuthuyetmang',
      tokens: {
        '--bg-primary': '#000000',
        '--bg-surface': '#0d0d0d',
        '--text-primary': '#e8e4e0',
        '--text-secondary': '#a39e98',
        '--accent': '#d95a52',
        '--accent-hover': '#e8726a',
        '--vip-gold': '#d4a017',
        '--border': 'hsla(12, 25%, 61%, 0.2)',
        '--active-cue-bg': 'rgba(217, 90, 82, 0.22)',
        '--active-cue-border': '#d95a52'
      }
    });

    this.register({
      id: 'tieuthuyetmang-light',
      name: 'Tiểu Thuyết Mạng (Sáng Gốc)',
      type: 'light',
      author: 'Tieuthuyetmang',
      tokens: {
        '--bg-primary': '#fff8f6',
        '--bg-surface': '#ffffff',
        '--text-primary': '#2d1f1c',
        '--text-secondary': '#6b5348',
        '--accent': '#e54d42',
        '--accent-hover': '#c43d33',
        '--vip-gold': '#e8a317',
        '--border': 'rgba(229, 77, 66, 0.12)',
        '--active-cue-bg': 'rgba(229, 77, 66, 0.12)',
        '--active-cue-border': '#e54d42'
      }
    });

    this.register({
      id: 'tieuthuyetmang-sepia',
      name: 'Giấy Vàng Cổ Điển (Sepia)',
      type: 'light',
      author: 'Tieuthuyetmang',
      tokens: {
        '--bg-primary': '#f4ecd8',
        '--bg-surface': '#faf5eb',
        '--text-primary': '#5c4b37',
        '--text-secondary': '#7d6a54',
        '--accent': '#b85d19',
        '--accent-hover': '#9a4a0f',
        '--vip-gold': '#b8860b',
        '--border': 'rgba(92, 75, 55, 0.15)',
        '--active-cue-bg': 'rgba(184, 93, 25, 0.15)',
        '--active-cue-border': '#b85d19'
      }
    });

    this.register({
      id: 'oled-pure-black',
      name: 'OLED Pure Black (Đen Thuần)',
      type: 'dark',
      author: 'Community',
      tokens: {
        '--bg-primary': '#000000',
        '--bg-surface': '#000000',
        '--text-primary': '#f3f4f6',
        '--text-secondary': '#9ca3af',
        '--accent': '#ef4444',
        '--accent-hover': '#dc2626',
        '--vip-gold': '#f59e0b',
        '--border': '#262626',
        '--active-cue-bg': 'rgba(239, 68, 68, 0.2)',
        '--active-cue-border': '#ef4444'
      }
    });
  }

  /**
   * Đăng ký một Theme Plugin
   * @param {Object} themePlugin - Đối tượng theme plugin
   */
  register(themePlugin) {
    if (!themePlugin || !themePlugin.id) {
      console.warn('[ThemeEngine] Plugin không hợp lệ, thiếu id.');
      return;
    }
    this.themes.set(themePlugin.id, themePlugin);
  }

  /**
   * Nạp theme plugin từ file JSON
   * @param {string} url - Đường dẫn tới file .theme.json
   */
  async loadFromUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const themeData = await res.json();
      this.register(themeData);
      return themeData;
    } catch (err) {
      console.error(`[ThemeEngine] Lỗi khi nạp theme từ ${url}:`, err);
      return null;
    }
  }

  /**
   * Áp dụng theme theo ID
   * @param {string} themeId - ID của theme
   */
  apply(themeId) {
    const theme = this.themes.get(themeId);
    if (!theme) {
      console.warn(`[ThemeEngine] Không tìm thấy theme id="${themeId}".`);
      return false;
    }

    const root = document.documentElement;
    if (!root) return false;

    // Gán data-theme để kích hoạt Tailwind dark/light variants nếu có
    if (theme.type === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.setAttribute('data-theme', 'dark');
    }

    // Gán toàn bộ tokens (CSS Variables)
    if (theme.tokens) {
      Object.entries(theme.tokens).forEach(([prop, val]) => {
        root.style.setProperty(prop, val);
      });
    }

    // Gán font chữ nếu có
    if (theme.fonts) {
      if (theme.fonts.sans) root.style.setProperty('--font-sans', theme.fonts.sans);
      if (theme.fonts.serif) root.style.setProperty('--font-serif', theme.fonts.serif);
    }

    this.currentThemeId = themeId;
    localStorage.setItem(this.storageKey, themeId);

    // Kích hoạt sự kiện để các UI component lắng nghe nếu cần
    window.dispatchEvent(new CustomEvent('themechanged', { detail: { themeId, theme } }));
    return true;
  }

  /**
   * Lấy danh sách toàn bộ theme đã đăng ký
   */
  getAllThemes() {
    return Array.from(this.themes.values());
  }

  /**
   * Khởi tạo hệ thống theme khi trang web tải xong
   */
  async init() {
    // 1. Đăng ký các theme plugin mặc định
    const defaultThemes = [
      '/plugins/themes/tieuthuyetmang-dark.theme.json',
      '/plugins/themes/tieuthuyetmang-light.theme.json',
      '/plugins/themes/tieuthuyetmang-sepia.theme.json',
      '/plugins/themes/oled-pure-black.theme.json'
    ];

    for (const url of defaultThemes) {
      await this.loadFromUrl(url);
    }

    // 2. Kiểm tra nếu có custom theme của người dùng trong localStorage
    try {
      const customSaved = localStorage.getItem(this.customThemeKey);
      if (customSaved) {
        const parsed = JSON.parse(customSaved);
        if (parsed.id) this.register(parsed);
      }
    } catch (_) {}

    // 3. Khôi phục theme đã chọn trước đó (mặc định dark)
    const savedId = localStorage.getItem(this.storageKey) || 'tieuthuyetmang-dark';
    if (this.themes.has(savedId)) {
      this.apply(savedId);
    } else {
      this.apply('tieuthuyetmang-dark');
    }
  }
}

// Khởi tạo đối tượng toàn cục
window.themeEngine = new ThemeEngine();
