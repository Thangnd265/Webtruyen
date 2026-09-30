/**
 * AudioWeb Full History Page Controller
 * Displays user reading/listening history sorted newest to oldest.
 */
(function () {
  'use strict';

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Gần đây';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return 'Vừa xong';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
      if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} ngày trước`;
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  }

  async function loadHistory() {
    const listContainer = document.getElementById('history-items-list');
    const statusEl = document.getElementById('history-sync-status');
    if (!listContainer) return;

    let items = [];
    const isLoggedIn = window.authManager && window.authManager.isLoggedIn();

    if (statusEl) {
      statusEl.textContent = isLoggedIn ? `Đã đồng bộ tài khoản: ${window.authManager.getUser()?.display_name}` : 'Lưu trữ cục bộ trên thiết bị';
    }

    if (isLoggedIn) {
      try {
        const res = await fetch('/api/user/history?limit=100', {
          headers: { Authorization: `Bearer ${window.authManager.getToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          items = data.map(i => ({
            slug: i.book_slug,
            title: i.book_title,
            author: i.book_author || 'Tác Giả Ẩn Danh',
            cover_url: i.book_cover || `/api/books/${i.book_slug}/cover`,
            chapter_id: i.chapter_id,
            chapter_title: i.chapter_title,
            currentTime: i.current_time || 0,
            duration: i.duration || 0,
            progress: Math.min(100, Math.max(1, Math.round(i.progress || 1))),
            updated_at: i.updated_at
          }));
        }
      } catch (err) {
        console.warn('Lỗi lấy lịch sử server:', err);
      }
    }

    // Fallback to local storage if empty or offline
    if (items.length === 0) {
      try {
        const raw = localStorage.getItem('audioweb-recent-history');
        if (raw) {
          const localList = JSON.parse(raw);
          if (Array.isArray(localList)) {
            items = localList.map(i => ({
              slug: i.bookSlug || i.slug,
              title: i.bookTitle || i.title,
              author: i.bookAuthor || i.author || 'Tác Giả Ẩn Danh',
              cover_url: i.bookCover || i.cover_url || `/api/books/${i.bookSlug || i.slug}/cover`,
              chapter_id: i.chapterId || i.chapter_id || 'chapter_001',
              chapter_title: i.chapterTitle || i.chapter_title || 'Chương 1',
              currentTime: Number(i.currentTime || i.time || 0),
              duration: Number(i.duration || 0),
              progress: Math.min(100, Math.max(1, Math.round(i.progress || 1))),
              updated_at: i.updatedAt || i.updated_at || 'Gần đây'
            }));
          }
        }
      } catch (_) {}
    }

    // Sort items newest first (mới nhất ở trên cùng)
    items.sort((a, b) => {
      const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return timeB - timeA;
    });

    renderItems(items);
  }

  function renderItems(items) {
    const listContainer = document.getElementById('history-items-list');
    if (!listContainer) return;

    if (!items || items.length === 0) {
      listContainer.innerHTML = `
        <div class="py-16 text-center rounded-2xl border" style="background-color:var(--bg-surface);border-color:var(--border)">
          <div class="text-4xl mb-3">🎧</div>
          <h3 class="text-lg font-bold mb-1" style="color:var(--text-primary)">Chưa có lịch sử nghe nào</h3>
          <p class="text-xs sm:text-sm max-w-md mx-auto mb-5" style="color:var(--text-secondary)">
            Các bộ truyện bạn nghe hoặc đọc sẽ được tự động lưu lại ở đây từ mới nhất đến cũ nhất.
          </p>
          <a href="/#featured-section" class="px-5 py-2.5 rounded-full font-bold text-sm text-white inline-flex items-center gap-2 shadow-md hover:opacity-90 transition" style="background-color:var(--accent);text-decoration:none">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            <span>Khám phá truyện ngay</span>
          </a>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = items.map((item, index) => {
      const targetUrl = `/reader.html?slug=${encodeURIComponent(item.slug)}&chapter=${encodeURIComponent(item.chapter_id)}`;
      const timeLabel = formatRelativeTime(item.updated_at);
      const posLabel = item.duration > 0 
        ? `${formatTime(item.currentTime)} / ${formatTime(item.duration)}`
        : formatTime(item.currentTime);

      return `
        <article class="history-card" data-slug="${item.slug}">
          <div class="history-card-top flex-1 flex items-center gap-4 min-w-0">
            <!-- Thumbnail -->
            <a href="${targetUrl}" class="flex-shrink-0" style="text-decoration:none">
              <img src="${item.cover_url}" alt="${item.title}" class="history-thumb shadow-sm hover:scale-105 transition-transform duration-200" onerror="this.src='/api/books/${item.slug}/cover'" />
            </a>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  #${index + 1} Mới nghe
                </span>
                <span class="text-[11px] opacity-75" style="color:var(--text-secondary)">
                  🕒 ${timeLabel}
                </span>
              </div>

              <h2 class="text-base sm:text-lg font-bold leading-snug truncate">
                <a href="${targetUrl}" class="hover:text-[var(--accent)] transition-colors" style="color:var(--text-primary);text-decoration:none">
                  ${item.title}
                </a>
              </h2>

              <p class="text-xs mt-0.5 truncate" style="color:var(--text-secondary)">
                Tác giả: <span class="font-semibold" style="color:var(--text-primary)">${item.author}</span>
              </p>

              <p class="text-xs font-semibold mt-1 flex items-center gap-1.5" style="color:var(--accent)">
                <span>Đang nghe:</span>
                <span class="truncate">${item.chapter_title}</span>
              </p>

              <!-- Progress bar -->
              <div class="mt-2.5 max-w-md">
                <div class="flex items-center justify-between text-[11px] mb-1" style="color:var(--text-secondary)">
                  <span>Tiến độ: <b style="color:var(--text-primary)">${item.progress}%</b> (${posLabel})</span>
                </div>
                <div class="w-full h-1.5 rounded-full overflow-hidden" style="background-color:rgba(128,128,128,0.2)">
                  <div class="h-full rounded-full transition-all duration-300" style="width:${item.progress}%;background-color:var(--accent)"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="history-actions flex items-center gap-2.5 flex-shrink-0">
            <a href="${targetUrl}" class="px-4 py-2 rounded-full font-bold text-xs sm:text-sm text-white inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition" style="background-color:var(--accent);text-decoration:none">
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              <span>Tiếp tục nghe</span>
            </a>

            <button type="button" class="btn-delete-item p-2 rounded-full border hover:bg-red-500/10 hover:text-red-500 transition text-secondary" style="border-color:var(--border)" data-slug="${item.slug}" title="Xóa bộ truyện này khỏi lịch sử">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Attach delete listeners
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slug = btn.dataset.slug;
        if (!slug) return;
        if (!confirm('Bạn có chắc muốn xóa bộ truyện này khỏi lịch sử nghe?')) return;
        await deleteHistoryItem(slug);
      });
    });
  }

  async function deleteHistoryItem(slug) {
    // 1. If logged in, call backend delete
    if (window.authManager && window.authManager.isLoggedIn()) {
      try {
        await fetch(`/api/user/history/${encodeURIComponent(slug)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${window.authManager.getToken()}` }
        });
      } catch (err) {
        console.warn('Lỗi xóa lịch sử server:', err);
      }
    }

    // 2. Also remove from local cache
    try {
      const raw = localStorage.getItem('audioweb-recent-history');
      if (raw) {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list = list.filter(i => (i.bookSlug || i.slug) !== slug);
          localStorage.setItem('audioweb-recent-history', JSON.stringify(list));
        }
      }
    } catch (_) {}

    await loadHistory();
  }

  async function clearAllHistory() {
    if (!confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử nghe và đọc? Hành động này không thể hoàn tác.')) {
      return;
    }

    if (window.authManager && window.authManager.isLoggedIn()) {
      try {
        await fetch('/api/user/history', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${window.authManager.getToken()}` }
        });
      } catch (err) {
        console.warn('Lỗi xóa tất cả server:', err);
      }
    }

    localStorage.removeItem('audioweb-recent-history');
    await loadHistory();
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadHistory();

    const clearBtn = document.getElementById('clear-all-history-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAllHistory);
    }
  });

  window.addEventListener('audioweb:auth-changed', () => {
    loadHistory();
  });
})();
