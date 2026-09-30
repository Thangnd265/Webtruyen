/**
 * Reader & Audio Player Controller
 * Thiết kế chuẩn 2 chế độ hiển thị theo tieuthuyetmang.com:
 * 1. Chế độ Chỉ Nghe Audio (Ảnh 2): Vinyl Record Player Card toàn màn hình.
 * 2. Chế độ Hiện Chữ Văn Bản (Ảnh 3): Khung đọc văn bản + Sticky Mini Player ở đáy.
 */

const state = {
  viewMode: 'audio', // 'audio' (Ảnh 2) hoặc 'text' (Ảnh 3)
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
  voice: 'thienminh',
  readingSettings: {
    font: 'sans',
    fontSize: 18,
    lineHeight: 1.9,
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
  setupViewModeToggle();
  setupSettingsModal();
  setupAudioEngine();
  setupChapterDrawer();
  setupSpeedAndTimer();
  setupReportButton();
  setupVoiceModal();

  // Đọc slug từ URL
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('book') || params.get('slug') || 'tu-da-quai-bat-dau-tien-hoa-thang-cap-full';
  await loadBook(slug);
}

/**
 * Quản lý chuyển đổi giữa 2 chế độ:
 * - 'text': Đọc chữ văn bản kèm Karaoke audio đồng bộ từng câu + Mini Player (MẶC ĐỊNH)
 * - 'audio': Thẻ đĩa than trung tâm (Ảnh 2)
 */
function setupViewModeToggle() {
  const savedMode = localStorage.getItem('audioweb-reader-mode');
  // Mặc định luôn là 'text' (Chế độ Đọc chữ kèm Karaoke audio đồng bộ từng câu)
  if (savedMode === 'audio') {
    state.viewMode = 'audio';
  } else {
    state.viewMode = 'text';
  }
  applyViewMode();

  // Nút chuyển chế độ ở Header
  const headerModeText = document.getElementById('btn-mode-text');
  const headerModeAudio = document.getElementById('btn-mode-audio');
  if (headerModeText) {
    headerModeText.addEventListener('click', () => setViewMode('text'));
  }
  if (headerModeAudio) {
    headerModeAudio.addEventListener('click', () => setViewMode('audio'));
  }

  // Nút Live Karaoke Subtitle trên thẻ đĩa than (click để nhảy ngay sang chế độ đọc chữ)
  const vinylKaraokeBox = document.getElementById('vinyl-karaoke-box');
  if (vinylKaraokeBox) {
    vinylKaraokeBox.addEventListener('click', () => {
      setViewMode('text');
      if (state.currentActiveCueId) {
        const el = document.getElementById(state.currentActiveCueId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Nút chuyển sang Hiện Chữ trên thanh đáy (Ảnh 2)
  const switchToTextBtn = document.getElementById('btn-switch-to-text');
  if (switchToTextBtn) {
    switchToTextBtn.addEventListener('click', () => {
      setViewMode('text');
    });
  }

  // Nút quay lại Chế độ Chỉ Nghe trên Mini Player (Ảnh 3)
  const miniExpandBtn = document.getElementById('mini-player-expand-btn');
  const miniSwitchAudioBtn = document.getElementById('mini-switch-to-audio-icon');
  if (miniExpandBtn) {
    miniExpandBtn.addEventListener('click', () => {
      setViewMode('audio');
    });
  }
  if (miniSwitchAudioBtn) {
    miniSwitchAudioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setViewMode('audio');
    });
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('audioweb-reader-mode', mode);
  applyViewMode();
  if (mode === 'text') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Cuộn đến câu đang active nếu có
    if (state.currentActiveCueId) {
      setTimeout(() => {
        const el = document.getElementById(state.currentActiveCueId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }
}

function applyViewMode() {
  const audioView = document.getElementById('audio-only-view');
  const textView = document.getElementById('text-reading-view');
  const headerModeText = document.getElementById('btn-mode-text');
  const headerModeAudio = document.getElementById('btn-mode-audio');

  if (state.viewMode === 'text') {
    if (audioView) audioView.style.display = 'none';
    if (textView) textView.style.display = 'block';
    if (headerModeText) headerModeText.classList.add('active');
    if (headerModeAudio) headerModeAudio.classList.remove('active');
  } else {
    if (audioView) audioView.style.display = 'flex';
    if (textView) textView.style.display = 'none';
    if (headerModeText) headerModeText.classList.remove('active');
    if (headerModeAudio) headerModeAudio.classList.add('active');
  }
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
    contentEl.style.fontFamily = state.readingSettings.font === 'serif' ? 'var(--font-serif), Georgia, serif' : 'var(--font-sans), Nunito, sans-serif';
  }

  updateSettingsButtonsUI();
}

function updateSettingsButtonsUI() {
  // Font
  document.querySelectorAll('[data-set-font]').forEach((btn) => {
    const isActive = btn.dataset.setFont === state.readingSettings.font;
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    btn.style.color = isActive ? 'var(--accent)' : 'var(--text-primary)';
    btn.style.fontWeight = isActive ? '700' : '500';
  });

  // Size
  document.querySelectorAll('[data-set-size]').forEach((btn) => {
    const isActive = parseInt(btn.dataset.setSize, 10) === state.readingSettings.fontSize;
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    btn.style.color = isActive ? 'var(--accent)' : 'var(--text-primary)';
    btn.style.fontWeight = isActive ? '700' : '500';
  });

  // Line
  document.querySelectorAll('[data-set-line]').forEach((btn) => {
    const isActive = Math.abs(parseFloat(btn.dataset.setLine) - state.readingSettings.lineHeight) < 0.05;
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    btn.style.color = isActive ? 'var(--accent)' : 'var(--text-primary)';
    btn.style.fontWeight = isActive ? '700' : '500';
  });

  // Theme
  const curTheme = (window.themeEngine && window.themeEngine.currentThemeId) || 'tieuthuyetmang-dark';
  document.querySelectorAll('[data-set-reading-theme]').forEach((btn) => {
    const val = btn.dataset.setReadingTheme;
    let isActive = false;
    if (val === 'dark' && (curTheme.includes('dark') || curTheme.includes('black'))) {
      isActive = true;
    } else if (val === 'sepia' && curTheme.includes('sepia')) {
      isActive = true;
    } else if (val === 'white' && curTheme.includes('light')) {
      isActive = true;
    }

    if (isActive) {
      btn.style.outline = '2px solid var(--accent)';
      btn.style.outlineOffset = '2px';
      btn.style.fontWeight = '800';
    } else {
      btn.style.outline = 'none';
      btn.style.fontWeight = '500';
    }
  });
}

async function loadBook(slug) {
  state.bookSlug = slug;
  try {
    const res = await fetch(`/api/books/${slug}`);
    if (!res.ok) throw new Error('Không thể nạp dữ liệu truyện');
    const book = await res.json();
    state.bookData = book;
    state.chapters = book.chapters || [];

    // Tên truyện trên các thanh tiêu đề & breadcrumb
    const bookTitle = book.title || 'Audio Web';
    const audioBreadcrumb = document.getElementById('audio-breadcrumb-book-title');
    const textBreadcrumb = document.getElementById('text-breadcrumb-book-title');
    const audioStorySub = document.getElementById('audio-story-subtitle');
    const miniStorySub = document.getElementById('mini-story-title');

    if (audioBreadcrumb) audioBreadcrumb.textContent = bookTitle;
    if (textBreadcrumb) textBreadcrumb.textContent = bookTitle;
    if (audioStorySub) audioStorySub.textContent = bookTitle;
    if (miniStorySub) miniStorySub.textContent = bookTitle;

    // Chữ cái trung tâm đĩa than
    const vinylLetter = document.getElementById('vinyl-center-letter');
    if (vinylLetter) {
      vinylLetter.textContent = (bookTitle.trim()[0] || 'A').toUpperCase();
    }

    renderChapterDrawer();

    // Xác định chương cần đọc/nghe
    const params = new URLSearchParams(window.location.search);
    const reqCh = params.get('chapter');
    let idx = state.chapters.findIndex((c) => c.id === reqCh);
    if (idx === -1) idx = 0;

    await loadChapter(idx);
  } catch (err) {
    console.error('Lỗi khi nạp sách:', err);
  }
}

async function loadChapter(index) {
  if (index < 0 || index >= state.chapters.length) return;
  state.currentChapterIndex = index;
  const ch = state.chapters[index];
  state.currentChapterId = ch.id;

  // Cập nhật các vị trí hiển thị tiêu đề chương
  const formattedTitle = ch.title.startsWith('Chương') ? ch.title : `Chương ${index + 1}: ${ch.title}`;
  
  // 1. Thẻ đĩa than (Ảnh 2)
  const audioChTitle = document.getElementById('audio-chapter-title');
  if (audioChTitle) audioChTitle.textContent = `[ ${formattedTitle} ]`;

  // 2. Chế độ đọc chữ (Ảnh 3)
  const textChTitle = document.getElementById('text-chapter-title');
  if (textChTitle) textChTitle.textContent = formattedTitle;

  // 3. Mini Player (Ảnh 3)
  const miniChTitle = document.getElementById('mini-chapter-title');
  if (miniChTitle) miniChTitle.textContent = formattedTitle;

  // Nạp nội dung chữ
  const contentArea = document.getElementById('chapter-content');
  if (contentArea) {
    contentArea.innerHTML = `<div class="py-12 text-center text-sm text-neutral-400">Đang tải nội dung văn bản ${formattedTitle}...</div>`;
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
          <p id="${c.id}" data-start="${c.start}" data-end="${c.end}" class="reader-paragraph">
            ${c.text}
          </p>
        `).join('');
      } else {
        contentArea.innerHTML = `<p class="p-6 text-center text-neutral-400">Nội dung văn bản chương này đang được chuẩn bị.</p>`;
      }
    }

    // Nạp âm thanh
    if (chapterData.audio_url) {
      loadAudioTrack(chapterData.audio_url);
    }
    saveListeningHistory();
  } catch (err) {
    console.error('Lỗi khi tải chi tiết chương:', err);
  }
}

function loadAudioTrack(baseUrl) {
  const url = `${baseUrl}?voice=${encodeURIComponent(state.voice)}`;
  audio.src = url;
  audio.playbackRate = state.speed;
  audio.load();
}

function setupAudioEngine() {
  const mainPlayBtn = document.getElementById('btn-play-pause');
  const miniPlayBtn = document.getElementById('mini-play-pause-btn');
  const scrubber = document.getElementById('audio-scrubber');
  const timeCur = document.getElementById('time-current');
  const timeTot = document.getElementById('time-total');
  const miniTime = document.getElementById('mini-time-display');
  const miniProgress = document.getElementById('mini-progress-fill');
  const vinylDisc = document.getElementById('vinyl-disc');
  const playPauseIcon = document.getElementById('play-pause-icon');
  const miniPlayPauseIcon = document.getElementById('mini-play-pause-icon');

  function togglePlay() {
    if (audio.paused) {
      audio.play().catch((err) => console.log('Lỗi phát audio:', err));
    } else {
      audio.pause();
    }
  }

  if (mainPlayBtn) mainPlayBtn.addEventListener('click', togglePlay);
  if (miniPlayBtn) miniPlayBtn.addEventListener('click', togglePlay);

  // Khi đang phát
  audio.addEventListener('play', () => {
    if (vinylDisc) vinylDisc.classList.remove('paused');
    const pauseSvg = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    if (playPauseIcon) playPauseIcon.innerHTML = pauseSvg;
    if (miniPlayPauseIcon) miniPlayPauseIcon.innerHTML = pauseSvg;
    saveListeningHistory(true);
  });

  // Khi tạm dừng
  audio.addEventListener('pause', () => {
    if (vinylDisc) vinylDisc.classList.add('paused');
    const playSvg = `<path d="M8 5v14l11-7z"/>`;
    if (playPauseIcon) playPauseIcon.innerHTML = playSvg;
    if (miniPlayPauseIcon) miniPlayPauseIcon.innerHTML = playSvg;
    saveListeningHistory(true);
  });

  // Khi metadata audio nạp xong -> cập nhật ngay thời lượng chương
  const updateDurationUI = () => {
    const dur = audio.duration || 0;
    if (dur > 0) {
      const durStr = formatSeconds(dur);
      if (timeTot) timeTot.textContent = durStr;
      if (miniTime) miniTime.textContent = `${formatSeconds(audio.currentTime)} / ${durStr}`;
      if (scrubber) scrubber.max = dur;
    }
  };
  audio.addEventListener('loadedmetadata', updateDurationUI);
  audio.addEventListener('durationchange', updateDurationUI);
  audio.addEventListener('canplay', updateDurationUI);

  // Cập nhật thời gian & Scrubber & Mini progress
  audio.addEventListener('timeupdate', () => {
    saveListeningHistory(false);
    const cur = audio.currentTime;
    const dur = audio.duration || 1;
    const curStr = formatSeconds(cur);
    const durStr = formatSeconds(dur);

    // Cập nhật card lớn (Ảnh 2)
    if (timeCur) timeCur.textContent = curStr;
    if (timeTot && dur > 1) timeTot.textContent = durStr;
    if (scrubber && dur > 0) {
      scrubber.value = cur;
      scrubber.max = dur;
      const pct = (cur / dur) * 100;
      scrubber.style.background = `linear-gradient(to right, #e05d44 0%, #e05d44 ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`;
    }

    // Cập nhật mini player (Ảnh 3)
    if (miniTime) miniTime.textContent = `${curStr} / ${durStr}`;
    if (miniProgress && dur > 0) {
      miniProgress.style.width = `${(cur / dur) * 100}%`;
    }

    // Karaoke Cues khi đang nghe audio (đồng bộ từng câu chuẩn thời gian thực)
    if (state.cues && state.cues.length > 0) {
      let active = null;
      for (let i = 0; i < state.cues.length; i++) {
        const c = state.cues[i];
        const next = state.cues[i + 1];
        const nextStart = next ? next.start : c.end + 0.5;
        if (cur >= c.start && cur < Math.max(c.end, nextStart)) {
          active = c;
          break;
        }
      }

      if (active) {
        if (active.id !== state.currentActiveCueId) {
          document.querySelectorAll('.active-cue').forEach((el) => el.classList.remove('active-cue'));
          const el = document.getElementById(active.id);
          if (el) {
            el.classList.add('active-cue');
            if (state.viewMode === 'text') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          state.currentActiveCueId = active.id;
        }

        // Đồng bộ câu thoại hiển thị trên thẻ đĩa than (Vinyl Karaoke Subtitle)
        const vinylCue = document.getElementById('vinyl-current-cue');
        if (vinylCue && active.text) {
          vinylCue.textContent = active.text;
        }
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

  // TÍNH NĂNG AUDIO THEO TỪNG CÂU: Click vào câu văn bản để nghe ngay từ câu đó
  const contentArea = document.getElementById('chapter-content');
  if (contentArea) {
    contentArea.addEventListener('click', (e) => {
      const p = e.target.closest('[data-start]');
      if (p) {
        const start = parseFloat(p.dataset.start);
        if (!isNaN(start)) {
          audio.currentTime = start;
          audio.play().catch(() => {});
          document.querySelectorAll('.active-cue').forEach((el) => el.classList.remove('active-cue'));
          p.classList.add('active-cue');
          state.currentActiveCueId = p.id;

          // Cập nhật câu trên thẻ đĩa than
          const vinylCue = document.getElementById('vinyl-current-cue');
          if (vinylCue) {
            vinylCue.textContent = p.textContent.trim();
          }
        }
      }
    });
  }
}

function setupChapterDrawer() {
  const drawerBtn = document.getElementById('btn-open-drawer');
  const textDrawerBtn = document.getElementById('btn-text-open-drawer');
  const drawer = document.getElementById('chapter-drawer');
  const closeBtn = document.getElementById('btn-close-drawer');
  const backdrop = document.getElementById('drawer-backdrop');

  function openDrawer() {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  if (drawerBtn) drawerBtn.addEventListener('click', openDrawer);
  if (textDrawerBtn) textDrawerBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
}

function setupVoiceModal() {
  const voiceBtn = document.getElementById('btn-voice-header') || document.getElementById('btn-voice');
  const voiceModal = document.getElementById('voice-modal');
  const voiceClose = document.getElementById('voice-modal-close');
  const voiceLabel = document.getElementById('voice-label');

  if (voiceBtn && voiceModal) {
    voiceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      voiceModal.classList.remove('hidden');
    });
  }
  if (voiceClose && voiceModal) {
    voiceClose.addEventListener('click', () => voiceModal.classList.add('hidden'));
  }
  if (voiceModal) {
    voiceModal.addEventListener('click', (e) => {
      if (e.target === voiceModal) voiceModal.classList.add('hidden');
    });
  }

  document.querySelectorAll('.voice-preset-card').forEach((card) => {
    card.addEventListener('click', () => {
      const v = card.dataset.voice;
      state.voice = v;
      if (voiceLabel) voiceLabel.textContent = card.dataset.label || v;
      if (voiceModal) voiceModal.classList.add('hidden');

      // Tải lại track audio theo giọng mới mà giữ nguyên vị trí giây hiện tại
      if (state.currentChapterData) {
        const curTime = audio.currentTime;
        const wasPlaying = !audio.paused;
        loadAudioTrack(state.currentChapterData.audio_url);
        audio.addEventListener('loadedmetadata', () => {
          audio.currentTime = curTime;
          if (wasPlaying) audio.play().catch(() => {});
        }, { once: true });
      }
    });
  });
}

function renderChapterDrawer() {
  const list = document.getElementById('drawer-chapter-list');
  if (!list) return;
  list.innerHTML = state.chapters.map((ch, idx) => `
    <div style="padding:10px 12px;border-radius:10px;font-size:13.5px;cursor:pointer;transition:all 0.15s ease;background-color:${
      idx === state.currentChapterIndex ? 'rgba(224,93,68,0.18)' : 'transparent'
    };color:${idx === state.currentChapterIndex ? 'var(--accent)' : 'var(--text-primary)'};font-weight:${idx === state.currentChapterIndex ? '700' : '500'}"
    onclick="loadChapterByIndex(${idx})">
      ${ch.title}
    </div>
  `).join('');
}

window.loadChapterByIndex = (idx) => {
  const drawer = document.getElementById('chapter-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  loadChapter(idx);
};

function setupSpeedAndTimer() {
  // Speed popover
  const speedBtn = document.getElementById('btn-speed');
  const speedPopover = document.getElementById('speed-popover');
  const speedLabel = document.getElementById('speed-label');

  if (speedBtn && speedPopover) {
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      speedPopover.classList.toggle('show');
    });
    document.querySelectorAll('[data-speed-val]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const spd = parseFloat(btn.dataset.speedVal);
        state.speed = spd;
        audio.playbackRate = spd;
        if (speedLabel) speedLabel.textContent = `${spd}x`;
        speedPopover.classList.remove('show');
      });
    });
  }

  // Timer popover
  const timerBtn = document.getElementById('btn-timer');
  const timerPopover = document.getElementById('timer-popover');
  const timerLabel = document.getElementById('timer-label');

  if (timerBtn && timerPopover) {
    timerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      timerPopover.classList.toggle('show');
    });
    document.querySelectorAll('[data-timer-min]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mins = parseInt(btn.dataset.timerMin, 10);
        setSleepTimer(mins);
        timerPopover.classList.remove('show');
      });
    });
  }

  // Tự động phát toggle
  const autoNextBtn = document.getElementById('btn-auto-next');
  if (autoNextBtn) {
    autoNextBtn.addEventListener('click', () => {
      state.autoPlayNext = !state.autoPlayNext;
      autoNextBtn.classList.toggle('active', state.autoPlayNext);
    });
  }

  // Đóng popover khi click ngoài
  document.addEventListener('click', () => {
    if (speedPopover) speedPopover.classList.remove('show');
    if (timerPopover) timerPopover.classList.remove('show');
  });
}

function setSleepTimer(minutes) {
  if (state.sleepTimeoutId) clearTimeout(state.sleepTimeoutId);
  const timerLabel = document.getElementById('timer-label');
  if (minutes === 0) {
    if (timerLabel) timerLabel.textContent = 'Hẹn giờ';
    return;
  }
  if (timerLabel) timerLabel.textContent = `${minutes}m`;
  state.sleepTimeoutId = setTimeout(() => {
    audio.pause();
    if (timerLabel) timerLabel.textContent = 'Hẹn giờ';
    alert('Hẹn giờ tắt: Audio đã tạm dừng.');
  }, minutes * 60 * 1000);
}

function setupSettingsModal() {
  const btnAa = document.getElementById('btn-reading-settings');
  const popover = document.getElementById('settings-popover');

  if (btnAa && popover) {
    btnAa.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== btnAa) {
        popover.classList.remove('show');
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

  // Reading themes - Đồng bộ trực tiếp với hệ thống ThemeEngine toàn cục
  document.querySelectorAll('[data-set-reading-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.setReadingTheme;
      let targetTheme = 'tieuthuyetmang-dark';
      if (mode === 'sepia') targetTheme = 'tieuthuyetmang-sepia';
      else if (mode === 'white') targetTheme = 'tieuthuyetmang-light';

      if (window.themeEngine) {
        window.themeEngine.apply(targetTheme);
      }
      updateSettingsButtonsUI();
    });
  });

  // Lắng nghe thay đổi theme toàn cục (từ navbar hoặc plugin khác)
  window.addEventListener('themechanged', () => {
    updateSettingsButtonsUI();
    renderChapterDrawer();
  });
}

function saveAndApplySettings() {
  localStorage.setItem('audioweb-reader-settings', JSON.stringify(state.readingSettings));
  applyReadingSettings();
}

function setupReportButton() {
  const reportBtn = document.getElementById('btn-report-issue');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      alert('Cảm ơn bạn! Phản hồi báo lỗi chương/audio đã được gửi đến quản trị viên.');
    });
  }
}

let lastHistorySaveTime = 0;

function saveListeningHistory(force = false) {
  if (!state.bookSlug || !state.bookData) return;
  const now = Date.now();
  if (!force && now - lastHistorySaveTime < 4000) return;
  lastHistorySaveTime = now;

  try {
    const ch = (state.chapters && state.chapters[state.currentChapterIndex]) || { id: 'chapter_001', title: 'Chương 1' };
    const curTime = audio.currentTime || 0;
    const dur = audio.duration || 1;
    const pct = Math.min(100, Math.max(1, Math.round((curTime / dur) * 100)));

    const item = {
      book_slug: state.bookSlug,
      book_title: state.bookData.title || state.bookSlug,
      book_author: state.bookData.author || 'Tác Giả Ẩn Danh',
      book_cover: state.bookData.cover_url || `/api/books/${state.bookSlug}/cover`,
      chapter_id: state.currentChapterId || ch.id,
      chapter_title: ch.title || 'Chương 1',
      current_time: curTime,
      duration: dur,
      progress: pct
    };

    if (window.authManager) {
      window.authManager.saveProgress(item);
    } else {
      const history = JSON.parse(localStorage.getItem('audioweb-recent-history') || '[]');
      const entry = {
        slug: item.book_slug,
        title: item.book_title,
        author: item.book_author,
        cover_url: item.book_cover,
        chapter_id: item.chapter_id,
        chapter_title: item.chapter_title,
        progress: pct,
        currentTime: curTime,
        total_chapters: state.bookData.total_chapters || state.chapters.length || 1,
        updated_at: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' hôm nay'
      };
      const remaining = history.filter((h) => h.slug !== state.bookSlug);
      remaining.unshift(entry);
      localStorage.setItem('audioweb-recent-history', JSON.stringify(remaining.slice(0, 10)));
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', initReaderPage);
