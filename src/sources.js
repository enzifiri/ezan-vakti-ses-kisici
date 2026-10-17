// Vakit kaynakları ve kaynak seçimi.
//
// Hepsi hesap gerektirmez ve Diyanet'in il/ilçe kimliklerini kullanır, bu yüzden biri
// çalışmazsa konum değiştirmeden diğerine geçilebilir.

import * as imsakiyem from './imsakiyem.js';
import { createMirror } from './mirror.js';

export const SOURCES = {
  emushaf: {
    label: 'ezanvakti.emushaf.net',
    ...createMirror('emushaf', 'https://ezanvakti.emushaf.net', 'emushaf'),
  },
  imsakiyem: { label: 'ezanvakti.imsakiyem.com', ...imsakiyem },
  mtopal: {
    label: 'namazvakti.mtopal.dev',
    ...createMirror('mtopal', 'https://namazvakti.mtopal.dev', 'mtopal'),
  },
};

const DEFAULT_ORDER = ['emushaf', 'imsakiyem', 'mtopal'];

// Denenecek kaynaklar, öncelik sırasıyla: seçilen kaynak önce, diğerleri yedek.
export function getSourceChain(settings) {
  const pref = settings.preferredSource;
  const ids = DEFAULT_ORDER.includes(pref)
    ? [pref, ...DEFAULT_ORDER.filter((id) => id !== pref)]
    : DEFAULT_ORDER;
  return ids.map((id) => ({ id, ...SOURCES[id] }));
}

// Zincirdeki ilk çalışan kaynakla fn'i çalıştırır.
export async function withFailover(chain, fn) {
  const errors = [];
  for (const source of chain) {
    try {
      return { source, value: await fn(source) };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join(' · '));
}
