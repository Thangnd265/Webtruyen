/**
 * Navbar Controller - Quản lý thanh điều hướng, tìm kiếm và chuyển đổi giao diện sáng/tối
 */
function setupNavbar() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileNavMenu = document.getElementById('mobile-nav-menu');
  const searchInput = document.getElementById('navbar-search-input');

  // Toggle Theme (Dark <-> Light hoặc mở bảng chọn plugin theme)
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      if (!window.themeEngine) return;
      const current = window.themeEngine.currentThemeId;
      const currentTheme = window.themeEngine.themes.get(current);
      const isLight = currentTheme ? currentTheme.type === 'light' : (current.includes('light') || current.includes('sepia'));
      const next = isLight ? 'tieuthuyetmang-dark' : 'tieuthuyetmang-light';
      window.themeEngine.apply(next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(themeId) {
    if (!themeToggleIcon) return;
    if (themeId.includes('light') || themeId.includes('sepia')) {
      // Icon mặt trời
      themeToggleIcon.innerHTML = `
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2"></path>
        <path d="M12 20v2"></path>
        <path d="m4.93 4.93 1.41 1.41"></path>
        <path d="m17.66 17.66 1.41 1.41"></path>
        <path d="M2 12h2"></path>
        <path d="M20 12h2"></path>
        <path d="m6.34 17.66-1.41 1.41"></path>
        <path d="m19.07 4.93-1.41 1.41"></path>
      `;
      themeToggleBtn.title = 'Chuyển sang chế độ tối';
    } else {
      // Icon mặt trăng
      themeToggleIcon.innerHTML = `
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
      `;
      themeToggleBtn.title = 'Chuyển sang chế độ sáng';
    }
  }

  // Mobile menu toggle
  if (mobileMenuToggle && mobileNavMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileNavMenu.classList.toggle('hidden');
    });
  }

  // Tìm kiếm nhanh
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          window.location.href = `/?search=${encodeURIComponent(query)}`;
        }
      }
    });
  }

  // Khởi tạo icon theo theme hiện tại
  if (window.themeEngine) {
    updateThemeIcon(window.themeEngine.currentThemeId);
  }

  // Lắng nghe thay đổi theme từ themeEngine
  window.addEventListener('themechanged', (e) => {
    updateThemeIcon(e.detail.themeId);
  });
}

document.addEventListener('DOMContentLoaded', setupNavbar);
