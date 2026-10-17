import { PRAYERS } from '../settings.js';
import { send } from '../ui/messaging.js';

const $ = (id) => document.getElementById(id);

function setMsg(el, text, kind = '') {
  el.textContent = text;
  el.className = `small ${kind}`;
}

function fillSelect(select, items, selectedId, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  for (const item of items) select.append(new Option(item.name, item.id));
  if (selectedId) select.value = String(selectedId);
  select.disabled = false;
}

let settings;

async function loadStates() {
  setMsg($('locationStatus'), 'İller yükleniyor…', 'muted');
  try {
    const states = await send('getStates');
    fillSelect($('state'), states, settings.stateId, 'İl seçin');
    setMsg($('locationStatus'), '');
    if (settings.stateId) await loadCities(settings.stateId, settings.cityId);
  } catch (err) {
    setMsg($('locationStatus'), err.message, 'error');
  }
}

async function loadCities(stateId, selectedId) {
  $('city').disabled = true;
  setMsg($('locationStatus'), 'İlçeler yükleniyor…', 'muted');
  try {
    const cities = await send('getCities', { stateId: Number(stateId) });
    const stateName = $('state').selectedOptions[0]?.text || '';
    // Varsayılan olarak il merkezini seç
    const center = cities.find((c) => c.name.toLocaleUpperCase('tr') === stateName.toLocaleUpperCase('tr'));
    fillSelect($('city'), cities, selectedId || center?.id, 'İlçe seçin');
    setMsg($('locationStatus'), '');
    if (!selectedId && center) await saveLocation();
  } catch (err) {
    setMsg($('locationStatus'), err.message, 'error');
  }
}

async function saveLocation() {
  const cityId = Number($('city').value) || null;
  if (!cityId) return;
  setMsg($('locationStatus'), 'Vakitler alınıyor…', 'muted');
  try {
    settings = await send('saveSettings', {
      patch: {
        stateId: Number($('state').value),
        stateName: $('state').selectedOptions[0].text,
        cityId,
        cityName: $('city').selectedOptions[0].text,
      },
    });
    const { status } = await send('getStatus');
    if (status.lastFetchError) setMsg($('locationStatus'), status.lastFetchError, 'error');
    else setMsg($('locationStatus'), `Konum kaydedildi: ${settings.stateName} / ${settings.cityName}`, 'ok');
  } catch (err) {
    setMsg($('locationStatus'), err.message, 'error');
  }
}

function renderBehaviour() {
  $('mode').value = settings.mode;
  $('fadeOutSec').value = settings.fadeOutSec;
  $('fadeInSec').value = settings.fadeInSec;
  const rows = PRAYERS.map(({ key, name }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td>
      <td><input type="checkbox" data-prayer="${key}"></td>
      <td><input type="number" min="1" max="30" step="0.5" data-duration="${key}"></td>`;
    tr.cells[0].textContent = name;
    tr.querySelector('[data-prayer]').checked = settings.prayers[key];
    tr.querySelector('[data-duration]').value = settings.durations[key];
    return tr;
  });
  $('prayerRows').replaceChildren(...rows);
}

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

$('save').addEventListener('click', async () => {
  const prayers = {};
  const durations = {};
  for (const { key } of PRAYERS) {
    prayers[key] = document.querySelector(`[data-prayer="${key}"]`).checked;
    durations[key] = clamp(document.querySelector(`[data-duration="${key}"]`).value, 1, 30, settings.durations[key]);
  }
  try {
    settings = await send('saveSettings', {
      patch: {
        mode: $('mode').value,
        fadeOutSec: clamp($('fadeOutSec').value, 0, 60, 15),
        fadeInSec: clamp($('fadeInSec').value, 0, 30, 5),
        prayers,
        durations,
      },
    });
    renderBehaviour();
    setMsg($('saveStatus'), 'Kaydedildi', 'muted');
  } catch (err) {
    setMsg($('saveStatus'), err.message, 'error');
  }
});

async function refresh() {
  const status = await send('getStatus');
  settings = status.settings;
  $('sourceLabel').textContent = status.sourceLabel;

  const select = $('preferredSource');
  select.replaceChildren(new Option('Otomatik (önerilen)', 'auto'));
  for (const s of status.sources) select.append(new Option(s.label, s.id));
  select.value = settings.preferredSource;
  if (status.status.lastFetchError) setMsg($('locationStatus'), status.status.lastFetchError, 'error');
  return status;
}

// Tüm kaynaklar aynı il/ilçe kimliklerini kullandığı için konum değişmez
$('preferredSource').addEventListener('change', async (e) => {
  setMsg($('sourceStatus'), 'Vakitler seçilen kaynaktan alınıyor…', 'muted');
  try {
    await send('saveSettings', { patch: { preferredSource: e.target.value } });
    await refresh();
    setMsg($('sourceStatus'), 'Kaynak kaydedildi.', 'ok');
  } catch (err) {
    setMsg($('sourceStatus'), err.message, 'error');
  }
});

$('state').addEventListener('change', (e) => {
  if (e.target.value) loadCities(e.target.value);
});
$('city').addEventListener('change', saveLocation);

(async () => {
  await refresh();
  renderBehaviour();
  await loadStates();
})();
