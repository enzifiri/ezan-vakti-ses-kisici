// Kullanıcı ayarları ve paylaşılan sabitler.

export const PRAYERS = [
  { key: 'fajr', name: 'Sabah' },
  { key: 'dhuhr', name: 'Öğle' },
  { key: 'asr', name: 'İkindi' },
  { key: 'maghrib', name: 'Akşam' },
  { key: 'isha', name: 'Yatsı' },
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  // 'mute': sesi kıs ve sekmeyi sessize al; 'pause': sesi kıs ve medyayı duraklat
  mode: 'mute',
  fadeOutSec: 15,
  fadeInSec: 5,
  // Ezanın süresi (dakika). Ses bu sürenin sonunda geri açılır.
  // Sabah ezanı en uzun (3–5 dk), akşam en kısa (1–2 dk), diğerleri 2–3 dk; üst sınırlar alındı.
  durations: { fajr: 5, dhuhr: 3, asr: 3, maghrib: 2, isha: 3 },
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  // 'auto' ya da sources.js'teki bir kaynak kimliği
  preferredSource: 'auto',
  stateId: null,
  stateName: '',
  cityId: null,
  cityName: '',
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    durations: { ...DEFAULT_SETTINGS.durations, ...settings?.durations },
    prayers: { ...DEFAULT_SETTINGS.prayers, ...settings?.prayers },
  };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const settings = { ...current, ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}
