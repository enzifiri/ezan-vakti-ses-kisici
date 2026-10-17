// Diyanet'in namazvakti.diyanet.gov.tr verisini hesap gerektirmeden sunan gayriresmi servisler
// (ezanvakti.emushaf.net, namazvakti.mtopal.dev). İkisi de aynı biçimi kullanır:
// /sehirler/{ulkeId}, /ilceler/{sehirId}, /vakitler/{ilceId}

const TURKEY_ID = 2;

export async function getJson(url, label) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`${label} servisine ulaşılamadı.`);
  }
  if (res.status === 429) throw new Error(`${label}: istek sınırı aşıldı.`);
  if (!res.ok) throw new Error(`${label} hatası (HTTP ${res.status})`);
  return res.json();
}

export async function cached(key, loader) {
  const store = await chrome.storage.local.get(key);
  if (store[key]) return store[key];
  const value = await loader();
  await chrome.storage.local.set({ [key]: value });
  return value;
}

export const byName = (a, b) => a.name.localeCompare(b.name, 'tr');

// "18.10.2026" -> "2026-10-18"
function toDateKey(value) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(value || '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

export function createMirror(id, base, label) {
  const get = (path) => getJson(`${base}${path}`, label);
  return {
    getStates: () =>
      cached(`cache:${id}:states`, async () =>
        (await get(`/sehirler/${TURKEY_ID}`))
          .map((s) => ({ id: Number(s.SehirID), name: s.SehirAdi }))
          .sort(byName)),

    getCities: (stateId) =>
      cached(`cache:${id}:cities:${stateId}`, async () =>
        (await get(`/ilceler/${stateId}`))
          .map((c) => ({ id: Number(c.IlceID), name: c.IlceAdi }))
          .sort(byName)),

    async fetchMonthlyTimes(cityId) {
      const days = {};
      for (const d of await get(`/vakitler/${cityId}`)) {
        const key = toDateKey(d.MiladiTarihKisa);
        if (!key) continue;
        days[key] = {
          fajr: d.Imsak,
          sunrise: d.Gunes,
          dhuhr: d.Ogle,
          asr: d.Ikindi,
          maghrib: d.Aksam,
          isha: d.Yatsi,
          hijri: d.HicriTarihUzun,
        };
      }
      if (!Object.keys(days).length) throw new Error(`${label}: namaz vakitleri okunamadı.`);
      return days;
    },
  };
}
