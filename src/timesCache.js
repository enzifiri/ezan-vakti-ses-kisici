// Vakit önbelleğini günceller. Önce yılın tamamı (imsakiyem /yearly), eksik kalırsa aylık kaynaklar.
// Saf mantık: depolama ve saat dışarıdan verilir, böylece test edilebilir.

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const daysInYear = (y) => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);

// cached: önceki önbellek ({ cityId, days, years, fetchedAt }) ya da undefined
// years: { "2026": "ok" | son başarısız denemenin zamanı }
// chain: aylık kaynaklar (ilki çalışmazsa sıradaki)
// yearly: { label, fetchYear(cityId, year) }
export async function updateTimes(cached, { chain, cityId, now, yearly, withFailover }) {
  const same = cached?.cityId === cityId;
  const times = same
    ? { ...cached, days: { ...cached.days }, years: { ...cached.years } }
    : { cityId, days: {}, years: {}, fetchedAt: 0 };
  const nowMs = now.getTime();
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(nowMs + DAY_MS));
  const errors = [];
  let source = null;
  let changed = !same;

  // 1) Yıllık: bu yıl, Aralık'ta gelecek yıl. Başarısız/boş denemeler günde bir tekrarlanır.
  if (yearly) {
    const years = [now.getFullYear()];
    if (now.getMonth() === 11) years.push(now.getFullYear() + 1);
    for (const year of years) {
      const state = times.years[year];
      if (state === 'ok' || (typeof state === 'number' && nowMs - state < DAY_MS)) continue;
      try {
        const days = await yearly.fetchYear(cityId, year);
        const count = Object.keys(days).length;
        Object.assign(times.days, days);
        times.years[year] = count >= daysInYear(year) ? 'ok' : nowMs;
        if (count) source = `${yearly.label} (yıllık)`;
      } catch (err) {
        times.years[year] = nowMs;
        errors.push(err.message);
      }
      changed = true;
    }
  }

  // 2) Aylık yedek: yarın eksikse ya da 5 günden az veri kaldıysa
  const remaining = Object.keys(times.days).filter((k) => k >= today).length;
  const stale = !times.days[tomorrow] || remaining < 5;
  const recentlyFetched = nowMs - (times.fetchedAt || 0) < DAY_MS && times.days[today];
  if (stale && !recentlyFetched) {
    try {
      const result = await withFailover(chain, (s) => s.fetchMonthlyTimes(cityId));
      Object.assign(times.days, result.value);
      times.fetchedAt = nowMs;
      source = result.source.label;
      changed = true;
    } catch (err) {
      errors.push(err.message);
    }
  }

  // Geçmiş günleri temizle
  for (const k of Object.keys(times.days)) {
    if (k < today) {
      delete times.days[k];
      changed = true;
    }
  }

  const hasToday = Boolean(times.days[today]);
  return {
    times,
    changed,
    source,
    // Bugünün vakti yoksa hata; varsa uyarılar sessizce sonraki denemeye kalır
    error: hasToday ? null : errors.join(' · ') || 'Namaz vakitleri alınamadı.',
  };
}
