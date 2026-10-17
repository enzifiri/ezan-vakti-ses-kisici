// ezanvakti.imsakiyem.com — Diyanet verisini sunan açık kaynak servis (100 istek / 5 dk).
// Kimlikler (il 539, ilçe 9541 vb.) diğer ücretsiz kaynaklarla aynıdır.

import { getJson, cached, byName } from './mirror.js';

const BASE = 'https://ezanvakti.imsakiyem.com/api';
const LABEL = 'imsakiyem';
const TURKEY_ID = 2;

async function get(path) {
  const body = await getJson(`${BASE}${path}`, LABEL);
  if (!body.success) throw new Error(`${LABEL}: ${body.message || 'bilinmeyen hata'}`);
  return body.data;
}

export const getStates = () =>
  cached('cache:imsakiyem:states', async () =>
    (await get(`/locations/states?countryId=${TURKEY_ID}`))
      .map((s) => ({ id: Number(s._id), name: s.name }))
      .sort(byName));

export const getCities = (stateId) =>
  cached(`cache:imsakiyem:cities:${stateId}`, async () =>
    (await get(`/locations/districts?stateId=${stateId}`))
      .map((c) => ({ id: Number(c._id), name: c.name }))
      .sort(byName));

function toDays(list) {
  const days = {};
  for (const d of list) {
    const key = d.date?.slice(0, 10);
    if (!key || !d.times) continue;
    days[key] = {
      fajr: d.times.imsak,
      sunrise: d.times.gunes,
      dhuhr: d.times.ogle,
      asr: d.times.ikindi,
      maghrib: d.times.aksam,
      isha: d.times.yatsi,
      hijri: d.hijri_date?.full_date,
    };
  }
  return days;
}

// "monthly" takvim ayını döndürür; ay sonunda boşluk olmasın diye bu ayı ve gelecek ayı alıyoruz.
export async function fetchMonthlyTimes(cityId) {
  const now = new Date();
  const months = [0, 1].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const days = {};
  for (const start of months) {
    Object.assign(days, toDays(await get(`/prayer-times/${cityId}/monthly?startDate=${start}`)));
  }
  if (!Object.keys(days).length) throw new Error(`${LABEL}: namaz vakitleri okunamadı.`);
  return days;
}

// Bir takvim yılının tamamı (tek istek, ~300 KB). Diyanet yayınlamadıysa boş döner.
export async function fetchYear(cityId, year) {
  return toDays(await get(`/prayer-times/${cityId}/yearly?startDate=${year}-01-01`));
}
