/**
 * Reader & Audio Controller - Tái hiện chính xác chức năng đọc & nghe từ tieuthuyetmang.com
 */

const state = {
  bookSlug: '',
  bookData: null,
  chapters: [],
  currentChapterIndex: 0,
  currentChapterId: '',
  currentChapterData: null,
  cues: [],
  currentActiveCueId: null,
  autoPlayNext: true,
  speed: 1.0,
  sleepTimerMinutes: 0,
  sleepTimeoutId: null,
  voice: 'female',
  pitch: '0Hz',
  readingSettings: {
    font: 'sans',
    fontSize: 18,
    lineHeight: 2.0,
    theme: 'dark'
  }
};

const audio = new Audio();
audio.preload = 'metadata';

function formatSeconds(sec) {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

async function initReaderPage() {
  loadSavedSettings();
  setupSettingsModal();
  setupAudioEngine();
  setupChapterDrawer();
  setupSpeedAndTimer();

  // Đọc slug từ URL
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('book') || 'sample-story';
  await loadBook(slug);
}

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem('audioweb-reader-settings');
    if (saved) {
      state.readingSettings = { ...state.readingSettings, ...JSON.parse(saved) };
    }
  } catch (_) {}
  applyReadingSettings();
}

function applyReadingSettings() {
  const contentEl = document.getElementById('chapter-content');
  if (contentEl) {
    contentEl.style.fontSize = `${state.readingSettings.fontSize}px`;
    contentEl.style.lineHeight = state.readingSettings.lineHeight;
    contentEl.style.fontFamily = state.readingSettings.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';
  }

  // Cập nhật theme đọc
  const readerArea = document.getElementById('reader-area');
  if (readerArea) {
    if (state.readingSettings.theme === 'white') {
      readerArea.style.backgroundColor = '#fff9fa';
      readerArea.style.color = '#2d3436';
    } else if (state.readingSettings.theme === 'sepia') {
      readerArea.style.backgroundColor = '#f4ecd8';
      readerArea.style.color = '#5c4b37';
    } else {
      readerArea.style.backgroundColor = '#000000';
      readerArea.style.color = '#e8e4e0';
    }
  }
}

async function loadBook(slug) {
  state.bookSlug = slug;
  try {
    const res = await fetch(`/api/books/${slug}`);
    if (!res.ok) throw new Error('Không thể nạp dữ liệu truyện');
    const book = await res.json();
    state.bookData = book;
    state.chapters = book.chapters || [];

    const bookTitleEl = document.getElementById('reader-book-title');
    if (bookTitleEl) bookTitleEl.textContent = book.title;

    renderChapterDrawer();

    // Xác định chương cần đọc
    const params = new URLSearchParams(window.location.search);
    const reqCh = params.get('chapter');
    let idx = state.chapters.findIndex((c) => c.id === reqCh);
    if (idx === -1) idx = 0;

    await loadChapter(idx);
    checkKosyncProgress();
  } catch (err) {
    console.error('Lỗi khi nạp sách:', err);
  }
}

async function loadChapter(index) {
  if (index < 0 || index >= state.chapters.length) return;
  state.currentChapterIndex = index;
  const ch = state.chapters[index];
  state.currentChapterId = ch.id;

  // Cập nhật tiêu đề chương
  const titleEl = document.getElementById('chapter-title');
  if (titleEl) titleEl.textContent = ch.title;
  const audioTitleEl = document.getElementById('audio-chapter-title');
  if (audioTitleEl) audioTitleEl.textContent = ch.title;

  // Cập nhật trạng thái nút Trước / Sau
  const prevBtn = document.getElementById('btn-nav-prev');
  const nextBtn = document.getElementById('btn-nav-next');
  if (prevBtn) prevBtn.style.opacity = index === 0 ? '0.4' : '1';
  if (nextBtn) nextBtn.style.opacity = index === state.chapters.length - 1 ? '0.4' : '1';

  // Nạp nội dung chương từ backend
  const contentArea = document.getElementById('chapter-content');
  if (contentArea) {
    contentArea.innerHTML = `<div class="py-12 text-center text-sm" style="color:var(--text-secondary)">Đang tải nội dung ${ch.title}...</div>`;
  }

  try {
    const res = await fetch(`/api/books/${state.bookSlug}/chapters/${ch.id}`);
    if (!res.ok) throw new Error('Lỗi nạp chương');
    const chapterData = await res.json();
    state.currentChapterData = chapterData;
    state.cues = chapterData.cues || [];

    if (contentArea) {
      if (chapterData.html) {
        contentArea.innerHTML = chapterData.html;
      } else if (state.cues.length > 0) {
        contentArea.innerHTML = state.cues.map((c) => `
          <p id="${c.id}" data-start="${c.start}" data-end="${c.end}" class="reader-paragraph mb-4 cursor-pointer hover:opacity-90">
            ${c.text}
          </p>
        `).join('');
      } else {
        contentArea.innerHTML = `<p class="p-4 text-center">Nội dung đang được cập nhật.</p>`;
      }
    }

    // Nạp âm thanh
    if (chapterData.audio_url) {
      loadAudioTrack(chapterData.audio_url);
    }
  } catch (err) {
    console.error('Lỗi khi tải chi tiết chương:', err);
  }
}

function loadAudioTrack(baseUrl) {
  const url = `${baseUrl}?voice=${encodeURIComponent(state.voice)}&pitch=${encodeURIComponent(state.pitch)}`;
  audio.src = url;
  audio.playbackRate = state.speed;
  audio.load();
}

function setupAudioEngine() {
  const playBtn = document.getElementById('btn-play-pause');
  const scrubber = document.getElementById('audio-scrubber');
  const timeCur = document.getElementById('time-current');
  const timeTot = document.getElementById('time-total');
  const vinylDisc = document.getElementById('vinyl-disc');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play().catch((err) => console.log('Lỗi phát audio:', err));
      } else {
        audio.pause();
      }
    });
  }

  audio.addEventListener('play', () => {
    if (playBtn) {
      playBtn.innerHTML = `
        <svg class="lucide lucide-pause w-7 h-7 sm:w-8 sm:h-8" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
          <rect height="16" rx="1" width="4" x="6" y="4"></rect>
          <rect height="16" rx="1" width="4" x="14" y="4"></rect>
        </svg>
      `;
    }
    if (vinylDisc) vinylDisc.classList.remove('paused');
  });

  audio.addEventListener('pause', () => {
    if (playBtn) {
      playBtn.innerHTML = `
        <svg class="lucide lucide-play w-7 h-7 sm:w-8 sm:h-8 ml-1" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
          <polygon points="6 3 20 12 6 21 6 3"></polygon>
        </svg>
      `;
    }
    if (vinylDisc) vinylDisc.classList.add('paused');
    syncProgressToKosync();
  });

  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime;
    const dur = audio.duration;
    if (timeCur) timeCur.textContent = formatSeconds(cur);
    if (dur && timeTot) timeTot.textContent = formatSeconds(dur);

    if (scrubber && dur > 0) {
      const pct = (cur / dur) * 100;
      scrubber.value = cur;
      scrubber.max = dur;
      scrubber.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`;
    }

    // Karaoke Cues
    if (state.cues && state.cues.length > 0) {
      const active = state.cues.find((c) => cur >= c.start && cur < c.end);
      if (active && active.id !== state.currentActiveCueId) {
        document.querySelectorAll('.active-cue').forEach((el) => el.classList.remove('active-cue'));
        const el = document.getElementById(active.id);
        if (el) {
          el.classList.add('active-cue');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        state.currentActiveCueId = active.id;
      }
    }
  });

  if (scrubber) {
    scrubber.addEventListener('input', (e) => {
      audio.currentTime = parseFloat(e.target.value);
    });
  }

  // Seek +/- 10s
  const seekBackBtn = document.getElementById('btn-seek-back');
  const seekFwdBtn = document.getElementById('btn-seek-fwd');
  if (seekBackBtn) seekBackBtn.addEventListener('click', () => (audio.currentTime = Math.max(0, audio.currentTime - 10)));
  if (seekFwdBtn) seekFwdBtn.addEventListener('click', () => (audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10)));

  // Chuyển chương Trước / Sau
  const prevChapterBtn = document.getElementById('btn-prev-chapter');
  const nextChapterBtn = document.getElementById('btn-next-chapter');
  if (prevChapterBtn) prevChapterBtn.addEventListener('click', () => loadChapter(state.currentChapterIndex - 1));
  if (nextChapterBtn) nextChapterBtn.addEventListener('click', () => loadChapter(state.currentChapterIndex + 1));

  // Tự động chuyển chương khi hết audio
  audio.addEventListener('ended', () => {
    if (state.autoPlayNext && state.currentChapterIndex < state.chapters.length - 1) {
      loadChapter(state.currentChapterIndex + 1).then(() => audio.play());
    }
  });

  // Click vào câu để nghe
  const contentArea = document.getElementById('chapter-content');
  if (contentArea) {
    contentArea.addEventListener('click', (e) => {
      const p = e.target.closest('[data-start]');
      if (p) {
        const start = parseFloat(p.dataset.start);
        if (!isNaN(start)) {
          audio.currentTime = start;
          audio.play().catch(() => {});
        }
      }
    });
  }
}

function setupSettingsModal() {
  const btnAa = document.getElementById('btn-reading-settings');
  const modalAa = document.getElementById('settings-popover');
  if (btnAa && modalAa) {
    btnAa.addEventListener('click', (e) => {
      e.stopPropagation();
      modalAa.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!modalAa.contains(e.target) && e.target !== btnAa) {
        modalAa.classList.add('hidden');
      }
    });
  }

  // Font options
  document.querySelectorAll('[data-set-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.readingSettings.font = btn.dataset.setFont;
      saveAndApplySettings();
    });
  });

  // Font sizes
  document.querySelectorAll('[data-set-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.readingSettings.fontSize = parseInt(btn.dataset.setSize, 10);
      saveAndApplySettings();
    });
  });

  // Line heights
  document.querySelectorAll('[data-set-line]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.readingSettings.lineHeight = parseFloat(btn.dataset.setLine);
      saveAndApplySettings();
    });
  });

  // Reading themes
  document.querySelectorAll('[data-set-reading-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.readingSettings.theme = btn.dataset.setReadingTheme;
      saveAndApplySettings();
    });
  });
}

function saveAndApplySettings() {
  localStorage.setItem('audioweb-reader-settings', JSON.stringify(state.readingSettings));
  applyReadingSettings();
}

function setupChapterDrawer() {
  const drawerBtn = document.getElementById('btn-open-drawer');
  const drawer = document.getElementById('chapter-drawer');
  const closeBtn = document.getElementById('btn-close-drawer');
  const backdrop = document.getElementById('drawer-backdrop');

  if (drawerBtn && drawer) {
    drawerBtn.addEventListener('click', () => {
      drawer.classList.remove('translate-x-full');
      if (backdrop) backdrop.classList.remove('hidden');
    });
  }
  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => {
      drawer.classList.add('translate-x-full');
      if (backdrop) backdrop.classList.add('hidden');
    });
  }
  if (backdrop && drawer) {
    backdrop.addEventListener('click', () => {
      drawer.classList.add('translate-x-full');
      backdrop.classList.add('hidden');
    });
  }
}

function renderChapterDrawer() {
  const list = document.getElementById('drawer-chapter-list');
  if (!list) return;
  list.innerHTML = state.chapters.map((ch, idx) => `
    <div class="py-2.5 px-3 rounded-lg text-sm cursor-pointer transition-colors hover:bg-neutral-800 ${
      idx === state.currentChapterIndex ? 'font-bold text-[var(--accent)] bg-neutral-800/60' : 'text-neutral-300'
    }" onclick="loadChapterByIndex(${idx})">
      ${ch.title}
    </div>
  `).join('');
}

window.loadChapterByIndex = (idx) => {
  const drawer = document.getElementById('chapter-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.add('translate-x-full');
  if (backdrop) backdrop.classList.add('hidden');
  loadChapter(idx);
};

function setupSpeedAndTimer() {
  // Speed menu
  const speedBtn = document.getElementById('btn-speed');
  const speedPopover = document.getElementById('speed-popover');
  if (speedBtn && speedPopover) {
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      speedPopover.classList.toggle('hidden');
    });
    document.querySelectorAll('[data-speed-val]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spd = parseFloat(btn.dataset.speedVal);
        state.speed = spd;
        audio.playbackRate = spd;
        speedBtn.textContent = `${spd}x`;
        speedPopover.classList.add('hidden');
      });
    });
  }

  // Sleep timer
  const timerBtn = document.getElementById('btn-timer');
  const timerPopover = document.getElementById('timer-popover');
  if (timerBtn && timerPopover) {
    timerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      timerPopover.classList.toggle('hidden');
    });
    document.querySelectorAll('[data-timer-min]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.timerMin, 10);
        setSleepTimer(mins);
        timerPopover.classList.add('hidden');
      });
    });
  }

  // Voice presets modal
  const voiceBtn = document.getElementById('btn-voice');
  const voiceModal = document.getElementById('voice-modal');
  const voiceClose = document.getElementById('voice-modal-close');
  if (voiceBtn && voiceModal) {
    voiceBtn.addEventListener('click', () => voiceModal.classList.remove('hidden'));
    if (voiceClose) voiceClose.addEventListener('click', () => voiceModal.classList.add('hidden'));
    document.querySelectorAll('.voice-preset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const v = card.dataset.voice;
        const p = card.dataset.pitch;
        state.voice = v;
        state.pitch = p;
        if (voiceBtn) voiceBtn.innerHTML = `🎙️ ${card.dataset.label || 'Giọng đọc'} ▾`;
        voiceModal.classList.add('hidden');

        // Seamless hot swap preserving current position
        if (state.currentChapterData) {
          const curTime = audio.currentTime;
          const wasPlaying = !audio.paused;
          loadAudioTrack(state.currentChapterData.audio_url);
          audio.addEventListener('loadedmetadata', () => {
            audio.currentTime = curTime;
            if (wasPlaying) audio.play();
          }, { once: true });
        }
      });
    });
  }

  // Autoplay next toggle
  const autoNextBtn = document.getElementById('btn-auto-next');
  if (autoNextBtn) {
    autoNextBtn.addEventListener('click', () => {
      state.autoPlayNext = !state.autoPlayNext;
      autoNextBtn.style.color = state.autoPlayNext ? 'var(--accent)' : 'var(--text-secondary)';
    });
  }
}

function setSleepTimer(minutes) {
  if (state.sleepTimeoutId) clearTimeout(state.sleepTimeoutId);
  const timerBtn = document.getElementById('btn-timer');
  if (minutes === 0) {
    if (timerBtn) timerBtn.textContent = 'Hẹn giờ';
    return;
  }
  if (timerBtn) timerBtn.textContent = `${minutes}m`;
  state.sleepTimeoutId = setTimeout(() => {
    audio.pause();
    if (timerBtn) timerBtn.textContent = 'Hẹn giờ';
    alert('Hẹn giờ tắt: Audio đã tự động tạm dừng.');
  }, minutes * 60 * 1000);
}

async function checkKosyncProgress() {
  if (!state.bookSlug) return;
  try {
    const res = await fetch(`/api/books/${state.bookSlug}/sync`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.chapter_id && data.chapter_id !== state.currentChapterId) {
      const banner = document.getElementById('resume-banner');
      const text = document.getElementById('resume-banner-text');
      if (banner && text) {
        text.textContent = `Bạn đã đọc đến ${data.chapter_id}. Tiếp tục từ đây?`;
        banner.classList.remove('hidden');
        document.getElementById('btn-resume-yes').onclick = () => {
          const idx = state.chapters.findIndex((c) => c.id === data.chapter_id);
          if (idx !== -1) loadChapter(idx);
          banner.classList.add('hidden');
        };
        document.getElementById('btn-resume-no').onclick = () => banner.classList.add('hidden');
      }
    }
  } catch (_) {}
}

async function syncProgressToKosync() {
  if (!state.bookSlug || !state.currentChapterId) return;
  try {
    await fetch(`/api/books/${state.bookSlug}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapter_id: state.currentChapterId,
        cue_id: state.currentActiveCueId,
        device: 'Tieuthuyetmang PWA'
      })
    });
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', initReaderPage);
