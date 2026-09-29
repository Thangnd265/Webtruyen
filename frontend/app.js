/**
 * Main Web Reader Application Bootstrap
 */
function updateMediaSession(bookTitle, chapterTitle, coverUrl) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapterTitle,
      artist: bookTitle,
      album: 'Tiểu Thuyết Mạng',
      artwork: coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }] : []
    });
  }
}

async function syncProgressToKosync(slug, chapterId, cueId) {
  if (!slug || !chapterId) return;
  try {
    await fetch(`/api/books/${slug}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_id: chapterId, cue_id: cueId, device: 'Tieuthuyetmang Web' })
    });
  } catch (_) {}
}
