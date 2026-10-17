import { PRAYERS, getSettings, saveSettings } from './settings.js';
import { SOURCES, getSourceChain, withFailover } from './sources.js';
import { fadeMedia } from './fader.js';
import { updateTimes, dateKey } from './timesCache.js';

const EVENT_PREFIX = 'ezan|';
const DAILY_ALARM = 'daily-refresh';
const RETRY_ALARM = 'retry-fetch';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Yardımcılar ----------


function toTimestamp(key, hhmm) {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

async function setStatus(patch) {
  const { status } = await chrome.storage.local.get('status');
  await chrome.storage.local.set({ status: { ...status, ...patch } });
}

async function getActive() {
  const { active } = await chrome.storage.session.get('active');
  return active || null;
}

const setActive = (active) =>
  active ? chrome.storage.session.set({ active }) : chrome.storage.session.remove('active');

// ---------- Vakitlerin önbelleği ----------

async function ensureTimes(chain, cityId) {
  const { times: cached } = await chrome.storage.local.get('times');
  const result = await updateTimes(cached, {
    chain,
    cityId,
    now: new Date(),
    yearly: { label: SOURCES.imsakiyem.label, fetchYear: SOURCES.imsakiyem.fetchYear },
    withFailover,
  });
  if (result.changed) await chrome.storage.local.set({ times: result.times });
  if (result.source) {
    await setStatus({ lastFetchAt: Date.now(), lastSource: result.source });
  }
  await setStatus({ lastFetchError: result.error });
  if (result.error) {
    chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 60 });
    throw new Error(result.error);
  }
  return result.times.days;
}

function buildEvents(days, settings) {
  const events = [];
  const now = new Date();
  for (const offset of [0, 1]) {
    const key = dateKey(new Date(now.getTime() + offset * DAY_MS));
    const day = days[key];
    if (!day) continue;
    for (const { key: prayer } of PRAYERS) {
      if (!settings.prayers[prayer] || !day[prayer]) continue;
      const startAt = toTimestamp(key, day[prayer]);
      events.push({
        prayer,
        outAt: startAt - settings.fadeOutSec * 1000,
        startAt,
        endAt: startAt + settings.durations[prayer] * 60 * 1000,
      });
    }
  }
  return events.sort((a, b) => a.startAt - b.startAt);
}

// ---------- Zamanlama ----------

async function clearEventAlarms() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms.filter((a) => a.name.startsWith(EVENT_PREFIX)).map((a) => chrome.alarms.clear(a.name)),
  );
}

const alarmName = (phase, ev) => `${EVENT_PREFIX}${phase}|${ev.prayer}|${ev.startAt}|${ev.endAt}`;

async function schedule() {
  await clearEventAlarms();
  const settings = await getSettings();
  if (!settings.enabled || !settings.cityId) {
    await setStatus({ nextEvent: null });
    return;
  }

  let days;
  try {
    days = await ensureTimes(getSourceChain(settings), settings.cityId);
  } catch {
    await setStatus({ nextEvent: null });
    return;
  }

  const now = Date.now();
  const active = await getActive();
  const { skippedStartAt } = await chrome.storage.session.get('skippedStartAt');
  const events = buildEvents(days, settings).filter(
    (ev) => ev.endAt > now && ev.startAt !== skippedStartAt,
  );

  for (const ev of events) {
    if (ev.outAt > now) {
      chrome.alarms.create(alarmName('out', ev), { when: ev.outAt });
      chrome.alarms.create(alarmName('start', ev), { when: ev.startAt });
      chrome.alarms.create(alarmName('end', ev), { when: ev.endAt });
    } else if (!active || active.startAt === ev.startAt) {
      // Tarayıcı ezan sırasında açıldıysa ya da ayar değiştiyse: hemen kıs
      if (!active) await beginFadeOut(ev, Math.max(0, ev.startAt - now));
      if (ev.startAt > now) chrome.alarms.create(alarmName('start', ev), { when: ev.startAt });
      else await muteAudibleTabs();
      chrome.alarms.create(alarmName('end', ev), { when: ev.endAt });
    }
  }

  const next = events.find((ev) => ev.startAt > now) || null;
  await setStatus({ nextEvent: next });
}

// ---------- Ses kontrolü ----------

// Dönüş: kısılan ses/video öğesi sayısı; sekmeye eklenemezse null.
async function injectFade(tabId, action, fadeMs, mode) {
  const run = async (target) => {
    const results = await chrome.scripting.executeScript({ target, func: fadeMedia, args: [action, fadeMs, mode] });
    return results.reduce((sum, r) => sum + (r.result || 0), 0);
  };
  // Önce gömülü oynatıcılar dahil tüm çerçeveler. Tek bir çerçeve bile reddederse
  // (ör. YouTube'daki betik izni olmayan sandbox'lı about:blank çerçevesi) Chrome tüm çağrıyı
  // iptal eder; o zaman yalnızca ana sayfaya ekle. İkisini birden çalıştırmıyoruz, çünkü ana
  // sayfada iki kez çalışan fade birbirinin zamanlayıcısını durdurur.
  try {
    return await run({ tabId, allFrames: true });
  } catch (err) {
    try {
      return await run({ tabId });
    } catch (mainErr) {
      // Site izni yok (manifest'teki müzik siteleri dışı) ya da chrome:// sayfası
      return null;
    }
  }
}

async function beginFadeOut(ev, fadeMs) {
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ audible: true });
  const active = { ...ev, mode: settings.mode, fadedTabs: [], mutedTabs: [] };
  await setActive(active);

  for (const tab of tabs) await fadeOrMute(tab, active, fadeMs);
  await setActive(active);

  const name = PRAYERS.find((p) => p.key === ev.prayer)?.name || '';
  chrome.notifications.create(`ezan-${ev.startAt}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `${name} ezanı`,
    message: ev.test ? 'Test: ses kısılıyor.' : 'Ezan okunuyor, ses kısılıyor.',
    silent: true,
  });
}

async function muteTab(tab, active) {
  if (tab.mutedInfo?.muted) return;
  try {
    await chrome.tabs.update(tab.id, { muted: true });
    if (!active.mutedTabs.includes(tab.id)) active.mutedTabs.push(tab.id);
  } catch {}
}

// Yavaşça kısılabiliyorsa kıs; izin yoksa ya da sayfada kısılacak ses öğesi yoksa
// (Web Audio vb.) ezanı beklemeden hemen sessize al.
async function fadeOrMute(tab, active, fadeMs) {
  const count = await injectFade(tab.id, 'out', fadeMs, active.mode);
  if (count > 0) {
    if (!active.fadedTabs.includes(tab.id)) active.fadedTabs.push(tab.id);
  } else {
    await muteTab(tab, active);
  }
}

// Ezan başladığında: kısılamayan sesler (Web Audio vb.) için sekmeyi de sessize al
async function muteAudibleTabs() {
  const active = await getActive();
  if (!active) return;
  const audible = await chrome.tabs.query({ audible: true });
  for (const tab of audible) await muteTab(tab, active);
  await setActive(active);
}

async function restore() {
  const active = await getActive();
  if (!active) return;
  await setActive(null);
  const settings = await getSettings();

  for (const tabId of active.mutedTabs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      // Sadece bizim sessize aldığımız sekmeleri aç; kullanıcı kendisi kapattıysa dokunma
      if (tab.mutedInfo?.muted && tab.mutedInfo.extensionId === chrome.runtime.id) {
        await chrome.tabs.update(tabId, { muted: false });
      }
    } catch {}
  }
  const fadeMs = settings.fadeInSec * 1000;
  await Promise.all(active.fadedTabs.map((id) => injectFade(id, 'in', fadeMs, active.mode)));
  chrome.notifications.clear(`ezan-${active.startAt}`);
}

// ---------- Olaylar ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY_ALARM || alarm.name === RETRY_ALARM) return schedule();
  if (!alarm.name.startsWith(EVENT_PREFIX)) return;

  const [, phase, prayer, startAt, endAt] = alarm.name.split('|');
  const ev = { prayer, startAt: Number(startAt), endAt: Number(endAt) };
  const settings = await getSettings();
  if (!settings.enabled) return;

  if (phase === 'out') {
    const active = await getActive();
    if (!active) await beginFadeOut(ev, Math.max(0, ev.startAt - Date.now()));
  } else if (phase === 'start') {
    await muteAudibleTabs();
  } else if (phase === 'end') {
    await restore();
    await schedule();
  }
});

// Ezan sırasında yeni ses başlarsa onu da sustur
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.audible !== true) return;
  const active = await getActive();
  if (!active || Date.now() >= active.endAt) return;
  if (Date.now() >= active.startAt) {
    await muteTab(tab, active);
  } else {
    await fadeOrMute(tab, active, active.startAt - Date.now());
  }
  await setActive(active);
});

async function setupDailyAlarm() {
  const next = new Date();
  next.setHours(0, 1, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  chrome.alarms.create(DAILY_ALARM, { when: next.getTime(), periodInMinutes: 24 * 60 });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await setupDailyAlarm();
  if (reason === 'install') chrome.runtime.openOptionsPage();
  await schedule();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupDailyAlarm();
  await schedule();
});

// ---------- Popup / ayarlar sayfası mesajları ----------

const handlers = {
  async getStatus() {
    const settings = await getSettings();
    const { status, times } = await chrome.storage.local.get(['status', 'times']);
    const today = times?.cityId === settings.cityId ? times.days[dateKey(new Date())] : null;
    return {
      settings,
      sourceLabel: status?.lastSource || getSourceChain(settings)[0].label,
      sources: Object.entries(SOURCES).map(([id, s]) => ({ id, label: s.label })),
      status: status || {},
      today,
      active: await getActive(),
    };
  },
  async getStates() {
    const chain = getSourceChain(await getSettings());
    return (await withFailover(chain, (s) => s.getStates())).value;
  },
  async getCities({ stateId }) {
    const chain = getSourceChain(await getSettings());
    return (await withFailover(chain, (s) => s.getCities(stateId))).value;
  },
  async saveSettings({ patch }) {
    const before = await getSettings();
    const settings = await saveSettings(patch);
    if (!settings.enabled || before.cityId !== settings.cityId) await restore();
    // Seçilen kaynaktan taze veri çekilsin
    if (before.preferredSource !== settings.preferredSource) await chrome.storage.local.remove('times');
    await schedule();
    return settings;
  },
  async test() {
    const settings = await getSettings();
    if (await getActive()) await restore();
    const now = Date.now();
    const ev = {
      prayer: 'dhuhr',
      test: true,
      startAt: now + settings.fadeOutSec * 1000,
      endAt: now + settings.fadeOutSec * 1000 + 20 * 1000,
    };
    await beginFadeOut(ev, settings.fadeOutSec * 1000);
    chrome.alarms.create(alarmName('start', ev), { when: ev.startAt });
    chrome.alarms.create(alarmName('end', ev), { when: ev.endAt });
    return true;
  },
  async skip() {
    const active = await getActive();
    if (active) await chrome.storage.session.set({ skippedStartAt: active.startAt });
    await restore();
    // Bu vaktin kalan alarmlarını atla, sonrakileri yeniden kur
    await schedule();
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});
