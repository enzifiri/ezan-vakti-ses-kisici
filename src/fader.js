// Sekmelere chrome.scripting.executeScript ile enjekte edilen fonksiyon.
// Kendi başına çalışmalı: dışarıdaki hiçbir değişkene başvuramaz.
//
// action: 'out' (sesi kıs) | 'in' (sesi geri aç)
// mode:   'mute' (sadece ses kısılır) | 'pause' (kısıldıktan sonra duraklatılır)
// Dönüş: etkilenen medya öğesi sayısı.
export function fadeMedia(action, fadeMs, mode) {
  const KEY = '__ezanVaktiSesKisici';
  const state = (window[KEY] ||= { items: new Map(), timer: null });
  clearInterval(state.timer);

  const ramp = (entries, from, to, done) => {
    const startedAt = performance.now();
    const tick = () => {
      const t = fadeMs > 0 ? Math.min(1, (performance.now() - startedAt) / fadeMs) : 1;
      // Kulağa doğal gelen eşit-güç eğrisi
      const k = from > to ? Math.cos((t * Math.PI) / 2) : Math.sin((t * Math.PI) / 2);
      for (const [el, s] of entries) {
        try {
          el.volume = Math.max(0, Math.min(1, s.volume * k));
        } catch {}
      }
      if (t >= 1) {
        clearInterval(state.timer);
        done?.();
      }
    };
    state.timer = setInterval(tick, 50);
    tick();
  };

  if (action === 'out') {
    for (const el of document.querySelectorAll('audio, video')) {
      if (state.items.has(el) || el.paused || el.muted || el.volume === 0) continue;
      state.items.set(el, { volume: el.volume, wasPlaying: true });
    }
    const entries = [...state.items];
    ramp(entries, 1, 0, () => {
      if (mode === 'pause') for (const [el] of entries) el.pause();
    });
    return entries.length;
  }

  // action === 'in'
  const entries = [...state.items].filter(([el]) => el.isConnected);
  state.items.clear();
  for (const [el, s] of entries) {
    el.volume = 0;
    if (mode === 'pause' && s.wasPlaying && el.paused) el.play().catch(() => {});
  }
  ramp(entries, 0, 1);
  return entries.length;
}
