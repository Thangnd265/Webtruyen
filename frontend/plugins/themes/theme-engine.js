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
