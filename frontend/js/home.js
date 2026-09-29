/**
 * Home Page Controller - Quản lý Hero Slider, Lưới Truyện Audio và Bảng Xếp Hạng
 */

// Dữ liệu mẫu bảng xếp hạng từ tieuthuyetmang.com gốc
const MONTH_RANKINGS = [
  { rank: 1, title: 'Hệ thống buộc lầm người, diễn viên quần chúng bị thúc ép đi nhân vật chính kịch bản', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KKGKP7C4QPWR77Z8RFS8ZZK0.jpeg', chapters: 165, views: '28.8k' },
  { rank: 2, title: 'Tai Ách Diệt Thế Ấy À? Đó Là Vợ Ta', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KK70AQVV31YXTG9V395500J4.png', chapters: 105, views: '27.7k' },
  { rank: 3, title: 'Bệnh kiều điên phê nữ giáo thụ? Mẹ của ta ơi hệ bạn gái!', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KKTPWCD48AYYJM7AWVKRC8A2.jpg', chapters: 146, views: '27.1k' },
  { rank: 4, title: 'Bé Cưng 3 Tuổi Dẫn Mẹ Tổng Tài Lạnh Lùng Đến Tận Cửa Đòi Cha', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KJZBNW84JD3XZNSB514EY2QA.jpg', chapters: 97, views: '24.1k' },
  { rank: 5, title: 'Chịu không nổi! Nữ Thần Học Đường Tôi Nuôi Quá Dính Người', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KJWV796MTJVDZTWQ7A04Z920.jpg', chapters: 57, views: '21.9k' },
  { rank: 6, title: 'Trên Mạng Là Chị Đẹp Game Thủ Phúc Hắc, Ngoài Đời Là Nữ Giáo Sư Lạnh Lùng', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KXCMFFDV6PPZ9B9K4JVWNPCX.png', chapters: 58, views: '20.8k' },
  { rank: 7, title: 'Vì Bảo Vệ Hoa Khôi Mà Chết, Nàng Điên Cuồng Đào Mộ Ta Cầu Hôn!', cover: 'https://img.tieuthuyetmang.com/images/avatars/01M2S6840T22AACXZT0C93V1W2.jpg', chapters: 57, views: '17.6k' },
  { rank: 8, title: 'Ai đã tháo mất nút thoát khỏi game tiên hiệp của tôi vậy?', cover: 'https://img.tieuthuyetmang.com/images/avatars/01M1QS5WV6ZVQARHNZKW9QSE74.png', chapters: 90, views: '16.7k' },
  { rank: 9, title: 'Vừa Lên Đại Học, Ngủ Một Đêm Có Luôn Cô Vợ Giáo Sư Tuyệt Sắc', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KXCNARS7D7HH4QJ90YJY5HQX.png', chapters: 40, views: '14.8k' },
  { rank: 10, title: 'Tỏ tình nuốt lời, ra điều kiện? Tôi đi gặp mặt "gái Tây"', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KSCMGPT75AGRRNH5VQDZZ0AY.png', chapters: 130, views: '13.8k' }
];

const USER_RANKINGS = [
  { rank: 1, name: 'KaaLinnie', tier: 'VVip', title: 'Trúc Cơ', exp: '34,245 EXP' },
  { rank: 2, name: 'Việt Hoàng', tier: 'VVip', title: 'Trúc Cơ', exp: '33,690 EXP' },
  { rank: 3, name: 'Trọng', tier: 'VVip', title: 'Trúc Cơ', exp: '28,450 EXP' },
  { rank: 4, name: 'namvntmreal', tier: 'Vip 2', title: 'Trúc Cơ', exp: '22,304 EXP' },
  { rank: 5, name: 'Phạm Tiến Vinh', tier: 'VVip', title: 'Trúc Cơ', exp: '21,595 EXP' }
];

async function initHomePage() {
  await loadAudioBooks();
  renderRankings();
  setupHeroSlider();
}

async function loadAudioBooks() {
  const container = document.getElementById('audio-books-grid');
  if (!container) return;

  try {
    const res = await fetch('/api/books');
    if (!res.ok) throw new Error('Không thể tải danh sách truyện');
    const books = await res.json();

    if (!books || books.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-sm" style="color:var(--text-secondary)">Chưa có cuốn sách nào trong thư viện.</div>`;
      return;
    }

    container.innerHTML = books.map((b) => `
      <article class="rounded-xl overflow-hidden border flex flex-row group cursor-pointer transition-all hover:border-[var(--accent)]"
               style="background-color:var(--bg-surface);border-color:var(--border)"
               onclick="window.location.href='/reader.html?book=${encodeURIComponent(b.slug)}'">
        <div class="flex-shrink-0 w-[120px] sm:w-40 min-h-[160px] sm:min-h-[180px] relative block overflow-hidden bg-neutral-900">
          <img src="${b.cover_url || '/api/books/' + b.slug + '/cover'}"
               alt="${b.title}"
               class="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
               onerror="this.src='/api/books/${b.slug}/cover'" />
          <span class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.45)]">
            <span class="flex items-center gap-1">
              <svg class="lucide lucide-headphones w-3 h-3" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"></path>
              </svg>
              Audio
            </span>
          </span>
        </div>
        <div class="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between">
          <div>
            <h3 class="text-sm sm:text-base font-bold line-clamp-2 mb-1.5 sm:mb-2 group-hover:underline" style="color:var(--text-primary)">
              ${b.title}
            </h3>
            <div class="flex flex-col gap-0.5 sm:flex-wrap sm:flex-row sm:items-center sm:gap-x-4 sm:gap-y-1 text-[11px] sm:text-xs mb-1.5 sm:mb-2" style="color:var(--text-secondary)">
              <span class="flex items-center gap-1">
                <svg class="lucide lucide-user w-3 h-3 flex-shrink-0" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                ${b.author || 'Tác Giả Ẩn Danh'}
              </span>
              <span class="flex items-center gap-1 text-red-500 font-medium">
                <svg class="lucide lucide-flag w-3 h-3 flex-shrink-0" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                  <line x1="4" x2="4" y1="22" y2="15"></line>
                </svg>
                ${b.status || 'Đang ra'}
              </span>
              <span>📖 ${b.total_chapters || 1} chương</span>
            </div>
            <p class="text-xs line-clamp-2 mb-3" style="color:var(--text-secondary)">
              ${b.description || 'Thưởng thức trải nghiệm nghe audio đồng bộ thời gian thực chuẩn Tiểu Thuyết Mạng.'}
            </p>
          </div>
          <div class="flex items-center justify-between pt-2 border-t" style="border-color:var(--border)">
            <span class="text-xs font-semibold flex items-center gap-1 text-amber-400">
              ★ ${b.rating || '4.8'}
            </span>
            <div class="flex items-center gap-2">
              <a href="/reader.html?book=${encodeURIComponent(b.slug)}&mode=audio"
                 class="px-3 py-1.5 rounded-full text-xs font-semibold text-white flex items-center gap-1 shadow-md hover:opacity-90 transition-opacity"
                 style="background-color:var(--accent)"
                 onclick="event.stopPropagation()">
                🎧 Nghe Audio
              </a>
            </div>
          </div>
        </div>
      </article>
    `).join('');
  } catch (err) {
    console.error('Lỗi khi nạp sách:', err);
    container.innerHTML = `<div class="p-8 text-center text-sm text-red-500">Lỗi kết nối máy chủ. Vui lòng thử lại sau.</div>`;
  }
}

function renderRankings() {
  const rankingList = document.getElementById('monthly-rankings-list');
  if (rankingList) {
    rankingList.innerHTML = MONTH_RANKINGS.map((item) => `
      <div class="flex items-center gap-3 py-2 border-b last:border-b-0 hover:opacity-90 cursor-pointer"
           style="border-color:var(--border)"
           onclick="window.location.href='/reader.html?book=sample-story'">
        <span class="w-6 text-center font-bold text-sm ${
          item.rank === 1 ? 'text-amber-400 font-extrabold text-base' :
          item.rank === 2 ? 'text-slate-300 font-bold' :
          item.rank === 3 ? 'text-amber-600 font-bold' : 'text-neutral-500'
        }">${item.rank}</span>
        <img src="${item.cover}" alt="${item.title}" class="w-10 h-14 object-cover rounded-md flex-shrink-0" onerror="this.src='/api/books/sample-story/cover'"/>
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-semibold truncate hover:text-[var(--accent)]" style="color:var(--text-primary)">${item.title}</h4>
          <span class="text-[11px]" style="color:var(--text-secondary)">${item.chapters} chương • ${item.views} lượt xem</span>
        </div>
      </div>
    `).join('');
  }

  const userList = document.getElementById('user-rankings-list');
  if (userList) {
    userList.innerHTML = USER_RANKINGS.map((u) => `
      <div class="flex items-center justify-between py-2 border-b last:border-b-0" style="border-color:var(--border)">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-5 text-xs font-bold text-neutral-400">#${u.rank}</span>
          <span class="text-xs font-semibold truncate" style="color:var(--text-primary)">${u.name}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">${u.tier}</span>
        </div>
        <span class="text-[11px] font-mono text-emerald-400">${u.title}</span>
      </div>
    `).join('');
  }
}

function setupHeroSlider() {
  const slides = [
    { title: 'Biết thế đã không chơi như vậy!', cover: 'https://img.tieuthuyetmang.com/images/avatars/01KNTTFQ5CRR9Y9S9AZGM7CG4K.png' },
    { title: 'Cho Cậu Học Ở Trường Quý Tộc, Vậy Mà Cậu Lại Đi Tán Gái Đại Tiểu Thư', cover: 'https://img.tieuthuyetmang.com/images/avatars/01M3NEMBC595SGKJY6S8P6EJJZ.png' },
    { title: 'Đồ Giám Quái Vật: Bắt Đầu Từ Huyết Mạch Goblin', cover: 'https://img.tieuthuyetmang.com/images/avatars/01M0HQ389AJ8ZY873B831ACBVM.jpg' }
  ];

  let current = 0;
  const titleEl = document.getElementById('hero-title');
  const bgEl = document.getElementById('hero-bg');
  const dotsContainer = document.getElementById('hero-dots');

  function showSlide(index) {
    current = (index + slides.length) % slides.length;
    if (titleEl) titleEl.textContent = slides[current].title;
    if (bgEl) bgEl.style.backgroundImage = `url(${slides[current].cover})`;

    if (dotsContainer) {
      dotsContainer.querySelectorAll('button').forEach((dot, idx) => {
        dot.className = idx === current ? 'h-2.5 rounded-full transition-all w-8 bg-white' : 'h-2.5 rounded-full transition-all w-2.5 bg-white/40 hover:bg-white/60';
      });
    }
  }

  const prevBtn = document.getElementById('hero-prev');
  const nextBtn = document.getElementById('hero-next');
  if (prevBtn) prevBtn.addEventListener('click', () => showSlide(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => showSlide(current + 1));

  // Tự động chuyển slide sau mỗi 6 giây
  setInterval(() => showSlide(current + 1), 6000);
}

document.addEventListener('DOMContentLoaded', initHomePage);
