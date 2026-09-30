/**
 * AudioWeb Auth Manager & Personalization Client
 */
(function () {
  'use strict';

  class AuthManager {
    constructor() {
      this.TOKEN_KEY = 'audioweb-token';
      this.USER_KEY = 'audioweb-user';
      this.LOCAL_HISTORY_KEY = 'audioweb-recent-history';

      this.token = localStorage.getItem(this.TOKEN_KEY) || null;
      this.user = null;
      try {
        const cached = localStorage.getItem(this.USER_KEY);
        if (cached) this.user = JSON.parse(cached);
      } catch (e) {
        this.user = null;
      }

      this.init();
    }

    init() {
      if (this.token) {
        this.fetchCurrentUser().catch(() => {
          this.logout();
        });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.onDomReady());
      } else {
        this.onDomReady();
      }
    }

    onDomReady() {
      this.renderNavbarAuthUI();
      this.setupModalListeners();
    }

    isLoggedIn() {
      return !!(this.token && this.user);
    }

    getToken() {
      return this.token;
    }

    getUser() {
      return this.user;
    }

    async fetchCurrentUser() {
      if (!this.token) return null;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${this.token}` }
        });
        if (!res.ok) throw new Error('Token expired or invalid');
        const user = await res.json();
        this.user = user;
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.renderNavbarAuthUI();
        return user;
      } catch (err) {
        this.logout();
        throw err;
      }
    }

    async register(username, password, displayName) {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
          display_name: displayName.trim() || username.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Đăng ký thất bại');
      }
      this.setSession(data.token, data.user);
      await this.syncLocalHistoryToServer();
      return data;
    }

    async login(username, password) {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Đăng nhập thất bại');
      }
      this.setSession(data.token, data.user);
      await this.syncLocalHistoryToServer();
      return data;
    }

    setSession(token, user) {
      this.token = token;
      this.user = user;
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      this.renderNavbarAuthUI();
      this.closeModal();
      window.dispatchEvent(new CustomEvent('audioweb:auth-changed', {
        detail: { isLoggedIn: true, user }
      }));
    }

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      this.renderNavbarAuthUI();
      window.dispatchEvent(new CustomEvent('audioweb:auth-changed', {
        detail: { isLoggedIn: false, user: null }
      }));
    }

    async syncLocalHistoryToServer() {
      if (!this.isLoggedIn()) return;
      try {
        const raw = localStorage.getItem(this.LOCAL_HISTORY_KEY);
        if (!raw) return;
        const localList = JSON.parse(raw);
        if (!Array.isArray(localList) || localList.length === 0) return;

        const items = localList.map(item => ({
          book_slug: item.bookSlug || item.slug || '',
          book_title: item.bookTitle || item.title || '',
          book_author: item.bookAuthor || item.author || '',
          book_cover: item.bookCover || item.cover || '',
          chapter_id: item.chapterId || item.chapter || '',
          chapter_title: item.chapterTitle || '',
          current_time: Number(item.currentTime || item.time || 0),
          duration: Number(item.duration || 0),
          progress: Number(item.progress || 0)
        })).filter(i => i.book_slug && i.chapter_id);

        if (items.length > 0) {
          await fetch('/api/user/history/sync-bulk', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ items })
          });
        }
      } catch (err) {
        console.warn('Lỗi đồng bộ lịch sử offline:', err);
      }
    }

    async saveProgress(item) {
      // 1. Always update localStorage for offline cache
      try {
        let history = JSON.parse(localStorage.getItem(this.LOCAL_HISTORY_KEY) || '[]');
        history = history.filter(h => (h.bookSlug || h.slug) !== item.book_slug);
        history.unshift({
          bookSlug: item.book_slug,
          slug: item.book_slug,
          bookTitle: item.book_title,
          title: item.book_title,
          bookAuthor: item.book_author || '',
          bookCover: item.book_cover || '',
          chapterId: item.chapter_id,
          chapterTitle: item.chapter_title || '',
          currentTime: item.current_time || 0,
          duration: item.duration || 0,
          progress: item.progress || 0,
          updatedAt: new Date().toISOString()
        });
        localStorage.setItem(this.LOCAL_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
      } catch (e) {}

      // 2. If logged in, send to backend
      if (this.isLoggedIn()) {
        try {
          await fetch('/api/user/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(item)
          });
        } catch (e) {
          console.warn('Không thể lưu tiến trình lên máy chủ:', e);
        }
      }
    }

    openModal(mode = 'login') {
      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      this.switchTab(mode);
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      const input = mode === 'register' 
        ? document.getElementById('auth-reg-username') 
        : document.getElementById('auth-login-username');
      input?.focus();
    }

    closeModal() {
      const modal = document.getElementById('auth-modal');
      if (!modal) return;
      modal.classList.remove('active');
      document.body.style.overflow = '';
      const errEl = document.getElementById('auth-error-msg');
      if (errEl) errEl.textContent = '';
    }

    switchTab(mode) {
      const loginTab = document.getElementById('auth-tab-login');
      const regTab = document.getElementById('auth-tab-register');
      const loginForm = document.getElementById('auth-form-login');
      const regForm = document.getElementById('auth-form-register');
      const errEl = document.getElementById('auth-error-msg');
      if (errEl) errEl.textContent = '';

      if (mode === 'register') {
        regTab?.classList.add('active');
        loginTab?.classList.remove('active');
        regForm?.classList.add('active');
        loginForm?.classList.remove('active');
      } else {
        loginTab?.classList.add('active');
        regTab?.classList.remove('active');
        loginForm?.classList.add('active');
        regForm?.classList.remove('active');
      }
    }

    setupModalListeners() {
      document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.open-auth-modal');
        if (openBtn) {
          e.preventDefault();
          this.openModal(openBtn.dataset.authMode || 'login');
        }
      });

      document.getElementById('auth-modal-close')?.addEventListener('click', () => this.closeModal());
      document.getElementById('auth-modal-overlay')?.addEventListener('click', () => this.closeModal());

      document.getElementById('auth-tab-login')?.addEventListener('click', () => this.switchTab('login'));
      document.getElementById('auth-tab-register')?.addEventListener('click', () => this.switchTab('register'));

      // Form login submit
      const loginForm = document.getElementById('auth-form-login');
      if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errEl = document.getElementById('auth-error-msg');
          const submitBtn = loginForm.querySelector('button[type="submit"]');
          if (errEl) errEl.textContent = '';
          const username = document.getElementById('auth-login-username')?.value || '';
          const password = document.getElementById('auth-login-password')?.value || '';

          try {
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = 'Đang đăng nhập...';
            }
            await this.login(username, password);
          } catch (err) {
            if (errEl) errEl.textContent = err.message;
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Đăng nhập';
            }
          }
        });
      }

      // Form register submit
      const regForm = document.getElementById('auth-form-register');
      if (regForm) {
        regForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errEl = document.getElementById('auth-error-msg');
          const submitBtn = regForm.querySelector('button[type="submit"]');
          if (errEl) errEl.textContent = '';
          const username = document.getElementById('auth-reg-username')?.value || '';
          const displayName = document.getElementById('auth-reg-displayname')?.value || '';
          const password = document.getElementById('auth-reg-password')?.value || '';

          try {
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = 'Đang tạo tài khoản...';
            }
            await this.register(username, password, displayName);
          } catch (err) {
            if (errEl) errEl.textContent = err.message;
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Đăng ký';
            }
          }
        });
      }

      // Escape key to close
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
    }

    renderNavbarAuthUI() {
      const containers = [
        document.getElementById('navbar-auth-container'),
        document.getElementById('mobile-auth-container')
      ].filter(Boolean);

      containers.forEach(container => {
        if (this.isLoggedIn()) {
          const initial = (this.user.display_name || this.user.username || 'U').charAt(0).toUpperCase();
          const color = this.user.avatar_color || '#e05d44';

          container.innerHTML = `
            <div class="user-profile-menu">
              <button class="user-menu-btn" type="button" aria-label="Tài khoản cá nhân">
                <span class="user-avatar-circle" style="background-color: ${color};">
                  ${initial}
                </span>
                <span class="user-display-name hidden md:inline">
                  ${this.user.display_name}
                </span>
                <svg class="w-4 h-4 text-secondary hidden md:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
              <div class="user-dropdown-menu">
                <div class="user-dropdown-header">
                  <div class="user-dropdown-header-name">${this.user.display_name}</div>
                  <div class="user-dropdown-header-sub">@${this.user.username}</div>
                </div>
                <a href="/history.html" class="user-dropdown-item">
                  <svg class="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span>Lịch sử nghe & đọc</span>
                </a>
                <button type="button" class="user-dropdown-item logout">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          `;

          const menuBtn = container.querySelector('.user-menu-btn');
          const dropdown = container.querySelector('.user-dropdown-menu');
          const logoutBtn = container.querySelector('.user-dropdown-item.logout');

          menuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('show');
          });

          logoutBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.logout();
          });
        } else {
          container.innerHTML = `
            <button class="auth-nav-login-btn open-auth-modal" type="button" data-auth-mode="login">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
              <span>Đăng nhập</span>
            </button>
          `;
        }
      });

      // Global click outside to dismiss all dropdown menus
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-profile-menu')) {
          document.querySelectorAll('.user-dropdown-menu.show').forEach(dd => {
            dd.classList.remove('show');
          });
        }
      });
    }
  }

  window.authManager = new AuthManager();
})();
