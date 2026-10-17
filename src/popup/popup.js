import { PRAYERS } from '../settings.js';
import { send } from '../ui/messaging.js';

const $ = (id) => document.getElementById(id);
const prayerName = (key) => PRAYERS.find((p) => p.key === key)?.name || key;
const clock = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

let state;
let countdownTimer;

function showError(message) {
  $('error').textContent = message || '';
  $('error').classList.toggle('hidden', !message);
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function render() {
  const { settings, status, today, active } = state;
  const ready = Boolean(settings.cityId);

  $('enabled').checked = settings.enabled;
  $('location').textContent = settings.cityName
    ? `${settings.stateName}${settings.cityName !== settings.stateName ? ' / ' + settings.cityName : ''}`
    : '';
  $('setup').classList.toggle('hidden', Boolean(ready));
  $('test').disabled = !settings.enabled;

  // Ezan sürüyor
  $('activeBox').classList.toggle('hidden', !active);
  if (active) {
    $('activeTitle').textContent = active.test ? 'Test çalışıyor' : `${prayerName(active.prayer)} ezanı`;
    $('activeUntil').textContent = `Ses ${clock(active.endAt)} civarında geri açılacak`;
  }

  // Sıradaki ezan
  const next = settings.enabled && !active ? status.nextEvent : null;
  $('nextBox').classList.toggle('hidden', !next);
  clearInterval(countdownTimer);
  if (next) {
    $('nextName').textContent = `${prayerName(next.prayer)} · ${clock(next.startAt)}`;
    const tick = () => ($('nextCountdown').textContent = formatCountdown(next.startAt - Date.now()));
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // Bugünün vakitleri
  const list = $('times');
  list.replaceChildren();
  if (today) {
    for (const { key, name } of [...PRAYERS.slice(0, 1), { key: 'sunrise', name: 'Güneş' }, ...PRAYERS.slice(1)]) {
      const li = document.createElement('li');
      const isPrayer = key !== 'sunrise';
      li.classList.toggle('off', isPrayer && !settings.prayers[key]);
      li.classList.toggle('is-next', next?.prayer === key && new Date(next.startAt).getDate() === new Date().getDate());
      li.append(Object.assign(document.createElement('span'), { textContent: name }));
      li.append(Object.assign(document.createElement('span'), { textContent: today[key] }));
      list.append(li);
    }
  }

  showError(ready ? status.lastFetchError : null);
}

async function load() {
  try {
    state = await send('getStatus');
    render();
  } catch (err) {
    showError(err.message);
  }
}

$('enabled').addEventListener('change', async (e) => {
  try {
    await send('saveSettings', { patch: { enabled: e.target.checked } });
  } catch (err) {
    showError(err.message);
  }
  load();
});

$('test').addEventListener('click', async () => {
  try {
    await send('test');
    load();
  } catch (err) {
    showError(err.message);
  }
});

$('skip').addEventListener('click', async () => {
  await send('skip').catch((err) => showError(err.message));
  load();
});

const openOptions = (e) => {
  e?.preventDefault();
  chrome.runtime.openOptionsPage();
};
$('options').addEventListener('click', openOptions);
$('setupLink').addEventListener('click', openOptions);

chrome.storage.onChanged.addListener(load);
load();
