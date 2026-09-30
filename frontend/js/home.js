/**
 * Home Page Controller - Giao diện chính 3 khối:
 * 1. Truyện Đề Cử (Slider 5-7 truyện hot, 4-5 truyện/dòng)
 * 2. Truyện Mới Cập Nhật (3-5 dòng truyện mới nhất)
 * 3. Truyện Đang Nghe (Lịch sử 3 bộ gần nhất)
 */

let allCatalogBooks = [];

async function initHomePage() {
  if (homePageInitialized) return;
  homePageInitialized = true;

  setupSliderControls();
  setupLatestControls();
  setupHistoryControls();
  await loadAllSections();
}

// Banners map cho từng bộ truyện từ Google Drive
const BANNER_MAP = {
  'sample-story': '/images/banners/banner_sample-story.jpg',
  'do-giam-quai-vat': '/images/banners/banner_do-giam-quai-vat.jpg',
  'xuyen-khong-1970': '/images/banners/banner_xuyen-khong-1970.jpg',
};

let currentHeroIndex = 0;
let totalHeroSlides = 3;
let heroAutoplayTimer = null;
let sliderControlsInitialized = false;
let homePageInitialized = false;

function setupSliderControls() {
  if (sliderControlsInitialized) return;
  sliderControlsInitialized = true;

  const prevBtn = document.getElementById('hero-prev-btn');
  const nextBtn = document.getElementById('hero-next-btn');
  const section = document.getElementById('featured-section');

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goToHeroSlide(currentHeroIndex - 1);
      startHeroAutoplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goToHeroSlide(currentHeroIndex + 1);
      startHeroAutoplay();
    });
  }

  // Dots click delegation
  const dotsContainer = document.getElementById('hero-dots-container');
  if (dotsContainer) {
    dotsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.hero-dot-item');
      if (btn && btn.dataset.index !== undefined) {
        goToHeroSlide(parseInt(btn.dataset.index, 10));
        startHeroAutoplay();
      }
    });
  }

  // Pause on hover
  if (section) {
    section.addEventListener('mouseenter', stopHeroAutoplay);
    section.addEventListener('mouseleave', startHeroAutoplay);

    // Touch swipe support (chuẩn di động chống vuốt nhảy cóc)
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchActive = false;

    section.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouchActive = true;
      }
    }, { passive: true });

    section.addEventListener('touchend', (e) => {
      if (!isTouchActive || e.changedTouches.length === 0) return;
      isTouchActive = false;
      const diffX = e.changedTouches[0].clientX - touchStartX;
      const diffY = e.changedTouches[0].clientY - touchStartY;

      // Chỉ kích hoạt đổi slide khi vuốt ngang rõ rệt hơn vuốt dọc và cự ly > 40px
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX < 0) {
          goToHeroSlide(currentHeroIndex + 1);
        } else {
          goToHeroSlide(currentHeroIndex - 1);
        }
        startHeroAutoplay();
      }
    }, { passive: true });

    // Mouse drag support trên desktop
    let mouseStartX = 0;
    let isMouseDown = false;
    section.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, a')) return;
      mouseStartX = e.clientX;
      isMouseDown = true;
    });
    section.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const diffX = e.clientX - mouseStartX;
      if (Math.abs(diffX) > 50) {
        if (diffX < 0) {
          goToHeroSlide(currentHeroIndex + 1);
        } else {
          goToHeroSlide(currentHeroIndex - 1);
        }
        startHeroAutoplay();
      }
    });
    section.addEventListener('mouseleave', () => {
      isMouseDown = false;
    });
  }

  startHeroAutoplay();
}

function startHeroAutoplay() {
  stopHeroAutoplay();
  heroAutoplayTimer = setInterval(() => {
    goToHeroSlide(currentHeroIndex + 1);
  }, 4500);
}

function stopHeroAutoplay() {
  if (heroAutoplayTimer) {
    clearInterval(heroAutoplayTimer);
    heroAutoplayTimer = null;
  }
}

function goToHeroSlide(index) {
  const track = document.getElementById('hero-slider-track');
  if (!track || totalHeroSlides === 0) return;

  currentHeroIndex = ((index % totalHeroSlides) + totalHeroSlides) % totalHeroSlides;
  track.style.transform = `translateX(-${currentHeroIndex * 100}%)`;

  // Update dots
  const dots = document.querySelectorAll('#hero-dots-container .hero-dot-item');
  dots.forEach((dot, idx) => {
    if (idx === currentHeroIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function setupHistoryControls() {
  const clearBtn = document.getElementById('clear-history-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Bạn có muốn đặt lại danh sách truyện đang nghe?')) {
        localStorage.removeItem('audioweb-recent-history');
        renderRecentBooksGrid(allCatalogBooks);
      }
    });
  }
}

// Danh sách 3 bộ truyện gốc từ Google Drive của bạn
const DRIVE_ORIGINALS = ['sample-story', 'do-giam-quai-vat', 'xuyen-khong-1970'];

function sortBooksWithDrivePriority(books) {
  if (!Array.isArray(books)) return [];
  const driveBooks = [];
  const otherBooks = [];

  DRIVE_ORIGINALS.forEach(slug => {
    const found = books.find(b => b.slug === slug);
    if (found) driveBooks.push(found);
  });

  books.forEach(b => {
    if (!DRIVE_ORIGINALS.includes(b.slug)) {
      otherBooks.push(b);
    }
  });

  return [...driveBooks, ...otherBooks];
}

async function loadAllSections() {
  try {
    const res = await fetch('/api/books');
    if (!res.ok) throw new Error('Không thể tải danh sách truyện từ server');
    const rawBooks = await res.json();
    allCatalogBooks = sortBooksWithDrivePriority(rawBooks);

    // Tìm kiếm nếu có query param
    const params = new URLSearchParams(window.location.search);
    const searchQuery = params.get('search')?.toLowerCase().trim();
    let displayBooks = allCatalogBooks;

    if (searchQuery) {
      displayBooks = allCatalogBooks.filter(b => 
        (b.title && b.title.toLowerCase().includes(searchQuery)) || 
        (b.author && b.author.toLowerCase().includes(searchQuery)) ||
        (b.genres && b.genres.toLowerCase().includes(searchQuery))
      );
    }

    renderFeaturedSlider(displayBooks);
    renderLatestBooksList(displayBooks);
    renderRecentBooksGrid(allCatalogBooks);
  } catch (err) {
    console.error('Lỗi khi nạp dữ liệu:', err);
    renderRecentBooksGrid([]);
  }
}

/**
 * 1. PHẦN TRUYỆN ĐỀ CỬ: THANH GẠT HERO BANNER (Chuẩn tieuthuyetmang.com)
 */
function renderFeaturedSlider(books) {
  const track = document.getElementById('hero-slider-track');
  const dotsContainer = document.getElementById('hero-dots-container');
  if (!track) return;

  if (!books || books.length === 0) return;

  const featuredBooks = books.slice(0, 7);
  totalHeroSlides = featuredBooks.length;

  const HERO_GENRE_MAP = {
    'sample-story': 'ĐỀ CỬ ĐẶC BIỆT',
    'do-giam-quai-vat': 'TÂY HUYỄN HOT',
    'xuyen-khong-1970': 'ĐÔ THỊ TRÙNG SINH',
  };

  track.innerHTML = featuredBooks.map((b, idx) => {
    const bannerUrl = BANNER_MAP[b.slug] || `/images/banners/banner_sample-story.jpg`;
    const genreTag = HERO_GENRE_MAP[b.slug] || (b.genres && b.genres[0]) || 'THỊNH HÀNH';
    const badgeLabel = `🔥 TOP #${idx + 1} • ${genreTag.toUpperCase()}`;
    const targetUrl = `/reader.html?slug=${encodeURIComponent(b.slug)}&chapter=chapter_001`;

    return `
      <div class="hero-slide" onclick="window.location.href='${targetUrl}'">
        <img src="${bannerUrl}" alt="${b.title}" class="hero-slide-bg" onerror="this.src='/images/banners/banner_sample-story.jpg'" />
        <div class="hero-slide-overlay"></div>
        <div class="hero-slide-content">
          <span class="hero-badge">
            ${badgeLabel}
          </span>
          <h2 class="hero-slide-title">
            ${b.title}
          </h2>
          <div class="hero-meta-row">
            <span>Tác giả: <strong>${b.author || 'Tác Giả Ẩn Danh'}</strong></span>
            <span class="hero-meta-divider">•</span>
            <span>${b.total_chapters || 1} chương</span>
            <span class="hero-meta-divider">•</span>
            <span class="hero-badge-audio">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" /></svg>
              Audio Đồng Bộ
            </span>
          </div>
          <div class="mt-4">
            <a href="${targetUrl}" class="hero-play-btn" onclick="event.stopPropagation()">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              <span>Nghe Ngay</span>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (dotsContainer) {
    dotsContainer.innerHTML = featuredBooks.map((_, idx) => `
      <button class="hero-dot-item ${idx === currentHeroIndex ? 'active' : ''}" data-index="${idx}" aria-label="Slide ${idx + 1}"></button>
    `).join('');
  }

  goToHeroSlide(0);
}

let currentLatestPage = 1;
const LATEST_PAGE_SIZE = 6;
let latestDisplayBooks = [];

const BOOK_DESCRIPTIONS = {
  'sample-story': 'Được gia đình gom góp cho theo học tại trường quý tộc hàng đầu, thế nhưng mục tiêu của cậu không phải danh vọng mà lại là chinh phục trái tim đại tiểu thư lạnh lùng kiêu sa...',
  'do-giam-quai-vat': 'Thế giới dị biến, quái vật hoành hành. Lâm Ẩn thức tỉnh Đồ Giám Quái Vật vô thượng, bắt đầu con đường tiến hóa nghịch thiên từ huyết mạch Goblin yếu ớt nhất...',
  'xuyen-khong-1970': 'Trùng sinh về những năm 1970 đầy biến động, mang theo tri thức hiện đại cùng không gian bí ẩn, chàng thanh niên từng bước làm giàu, đổi vận bản thân và gia tộc...',
};

function setupLatestControls() {
  const prevBtn = document.getElementById('latest-prev-btn');
  const nextBtn = document.getElementById('latest-next-btn');
  const viewAllBtn = document.getElementById('latest-view-all');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentLatestPage > 1) {
        currentLatestPage--;
        renderLatestBooksList(latestDisplayBooks);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(latestDisplayBooks.length / LATEST_PAGE_SIZE) || 1;
      if (currentLatestPage < totalPages) {
        currentLatestPage++;
        renderLatestBooksList(latestDisplayBooks);
      }
    });
  }

  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      currentLatestPage = 1;
      renderLatestBooksList(latestDisplayBooks);
    });
  }
}

/**
 * 2. PHẦN TRUYỆN MỚI CẬP NHẬT (Lưới 2 cột chuẩn tieuthuyetmang.com)
 */
function renderLatestBooksList(books) {
  const container = document.getElementById('latest-books-list');
  const pageIndicator = document.getElementById('latest-page-indicator');
  const prevBtn = document.getElementById('latest-prev-btn');
  const nextBtn = document.getElementById('latest-next-btn');
  if (!container) return;

  latestDisplayBooks = books || [];
  if (latestDisplayBooks.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-sm" style="color:var(--text-secondary)">Không có truyện mới cập nhật.</div>`;
    return;
  }

  const totalPages = Math.ceil(latestDisplayBooks.length / LATEST_PAGE_SIZE) || 1;
  if (currentLatestPage > totalPages) currentLatestPage = totalPages;
  if (currentLatestPage < 1) currentLatestPage = 1;

  if (pageIndicator) {
    pageIndicator.textContent = `${currentLatestPage} / ${totalPages}`;
  }
  if (prevBtn) {
    prevBtn.style.opacity = currentLatestPage <= 1 ? '0.35' : '1';
    prevBtn.style.pointerEvents = currentLatestPage <= 1 ? 'none' : 'auto';
  }
  if (nextBtn) {
    nextBtn.style.opacity = currentLatestPage >= totalPages ? '0.35' : '1';
    nextBtn.style.pointerEvents = currentLatestPage >= totalPages ? 'none' : 'auto';
  }

  const startIndex = (currentLatestPage - 1) * LATEST_PAGE_SIZE;
  const pageBooks = latestDisplayBooks.slice(startIndex, startIndex + LATEST_PAGE_SIZE);

  container.innerHTML = pageBooks.map((b, idx) => {
    const coverUrl = b.cover_url || `/api/books/${b.slug}/cover`;
    const desc = b.description || BOOK_DESCRIPTIONS[b.slug] || 'Truyện audio đồng bộ bản quyền với giọng đọc truyền cảm, âm thanh sống động, cập nhật chương mới liên tục hàng ngày.';
    const genre = (b.genres || 'Huyền Huyễn, Đô Thị').split(',')[0].trim();
    const views = b.views || `${(12.5 + (idx % 4) * 3.7).toFixed(1)}k`;
    const status = b.status || 'Đang ra';
    const date = b.updated_at || '29/09/2026';
    const targetUrl = `/reader.html?slug=${encodeURIComponent(b.slug)}&chapter=chapter_001`;

    return `
      <article class="latest-card group" onclick="window.location.href='${targetUrl}'">
        <!-- Bìa sách có nhãn Mới -->
        <div class="latest-cover-wrap">
          <img src="${coverUrl}" alt="${b.title}" onerror="this.src='/api/books/${b.slug}/cover'" />
          <span class="badge-new">
            ✨ Mới
          </span>
        </div>

        <!-- Chi tiết -->
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-sm sm:text-base line-clamp-2 leading-snug group-hover:text-[var(--accent)] transition-colors" style="color:var(--text-primary)">
              ${b.title}
            </h3>

            <!-- Dòng 1: Tác giả • Thể loại • Trạng thái -->
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] sm:text-xs" style="color:var(--text-secondary)">
              <span class="flex items-center gap-1 truncate max-w-[120px]">
                <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                ${b.author || 'Tác Giả Ẩn Danh'}
              </span>
              <span class="flex items-center gap-1 truncate max-w-[110px]">
                <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                ${genre}
              </span>
              <span class="flex items-center gap-1 font-medium text-amber-500">
                <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                ${status}
              </span>
            </div>

            <!-- Dòng 2: Chương • Lượt xem • Ngày -->
            <div class="flex items-center gap-2.5 mt-1 text-[11px] opacity-75" style="color:var(--text-secondary)">
              <span>📖 ${b.total_chapters || 1} chương</span>
              <span>•</span>
              <span>👁 ${views}</span>
              <span>•</span>
              <span>🕒 ${date}</span>
            </div>

            <!-- Tóm tắt 2 dòng -->
            <p class="line-clamp-2 text-xs leading-relaxed mt-2" style="color:var(--text-secondary)">
              ${desc}
            </p>
          </div>

          <!-- Nút Nghe Audio -->
          <div class="mt-3">
            <a href="${targetUrl}"
               class="px-3.5 py-1.5 rounded-full font-semibold text-white text-xs inline-flex items-center gap-1.5 shadow-sm transition-opacity hover:opacity-90"
               style="background-color:var(--accent)"
               onclick="event.stopPropagation()">
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              <span>Nghe Audio</span>
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * 3. PHẦN TRUYỆN ĐANG NGHE (Lịch sử từ tài khoản người dùng hoặc localStorage)
 */
async function renderRecentBooksGrid(books) {
  const container = document.getElementById('recent-books-grid');
  if (!container) return;

  let recentList = [];

  // 1. Thử lấy lịch sử từ server nếu đã đăng nhập
  if (window.authManager && window.authManager.isLoggedIn()) {
    try {
      const res = await fetch('/api/user/history?limit=10', {
        headers: { Authorization: `Bearer ${window.authManager.getToken()}` }
      });
      if (res.ok) {
        const serverList = await res.json();
        if (Array.isArray(serverList) && serverList.length > 0) {
          recentList = serverList.map(item => ({
            slug: item.book_slug,
            title: item.book_title,
            author: item.book_author || 'Tác Giả Ẩn Danh',
            cover_url: item.book_cover || `/api/books/${item.book_slug}/cover`,
            chapter_id: item.chapter_id,
            chapter_title: item.chapter_title,
            progress: Math.min(100, Math.max(5, Math.round(item.progress || 20))),
            currentTime: item.current_time || 0,
            updated_at: 'Đã đồng bộ'
          }));
        }
      }
    } catch (e) {
      console.warn('Lỗi lấy lịch sử server:', e);
    }
  }

  // 2. Nếu chưa có hoặc offline, đọc từ localStorage
  if (recentList.length === 0) {
    try {
      const raw = localStorage.getItem('audioweb-recent-history');
      const parsed = raw ? JSON.parse(raw) : [];
      recentList = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      recentList = [];
    }
  }

  if (recentList.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-8 text-center" style="color:var(--text-secondary)">
        <p class="text-sm">Bạn chưa có truyện nào trong danh sách đang nghe.</p>
        <a href="#featured-section" class="inline-block mt-3 px-4 py-1.5 rounded-full text-xs font-semibold border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition">Khám phá truyện ngay</a>
      </div>
    `;
    return;
  }

  // Hiển thị các bộ truyện thực sự đã nghe (tối đa 3 bộ trên trang chủ)
  const displayBooks = recentList.slice(0, 3);

  container.innerHTML = displayBooks.map((item) => {
    const coverUrl = item.cover_url || `/api/books/${item.slug}/cover`;
    const progress = Math.min(100, Math.max(5, item.progress || 20));
    const chapterName = item.chapter_title || 'Chương 1';
    const targetUrl = `/reader.html?slug=${encodeURIComponent(item.slug)}&chapter=${encodeURIComponent(item.chapter_id || 'chapter_001')}`;

    return `
      <article class="recent-card group"
               onclick="window.location.href='${targetUrl}'">
        
        <!-- Bìa sách dạng thumbnail -->
        <img src="${coverUrl}"
             alt="${item.title}"
             class="recent-thumb group-hover:scale-105 transition-transform duration-300"
             onerror="this.src='/api/books/${item.slug}/cover'" />

        <!-- Chi tiết tiến độ nghe -->
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 class="text-sm sm:text-base font-bold line-clamp-1 group-hover:underline" style="color:var(--text-primary)" title="${item.title}">
              ${item.title}
            </h3>
            <p class="text-xs flex items-center gap-1 mt-1 font-medium" style="color:var(--accent)">
              <span>Đang nghe:</span>
              <span class="truncate">${chapterName}</span>
            </p>
          </div>

          <!-- Thanh tiến độ nghe -->
          <div class="mt-2.5">
            <div class="flex items-center justify-between text-[11px] mb-1" style="color:var(--text-secondary)">
              <span>Tiến độ: <b>${progress}%</b></span>
              <span class="truncate">${item.updated_at || 'Gần đây'}</span>
            </div>
            <div class="w-full h-1.5 rounded-full overflow-hidden" style="background-color:rgba(128,128,128,0.2)">
              <div class="h-full rounded-full transition-all duration-500"
                   style="width:${progress}%;background-color:var(--accent)"></div>
            </div>
          </div>

          <!-- Nút tiếp tục -->
          <div class="mt-2.5 pt-2 border-t flex items-center justify-between" style="border-color:var(--border)">
            <span class="text-[11px] opacity-75 truncate" style="color:var(--text-secondary)">
              ${item.author || ''}
            </span>
            <a href="${targetUrl}"
               class="px-2.5 py-1 rounded-full text-xs font-semibold text-white flex items-center gap-1 shadow-sm transition-opacity hover:opacity-90"
               style="background-color:var(--accent)"
               onclick="event.stopPropagation()">
              <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Tiếp tục
            </a>
          </div>

        </div>
      </article>
    `;
  }).join('');
}

window.initHomePage = initHomePage;

window.addEventListener('audioweb:auth-changed', () => {
  renderRecentBooksGrid(allCatalogBooks);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHomePage);
} else {
  initHomePage();
}
