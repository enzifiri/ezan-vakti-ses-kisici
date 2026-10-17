# Ezan Vakti Ses Kapatıcı (Chrome eklentisi)

Ezan vakitlerinde tarayıcıda çalan sesi (YouTube, Spotify Web, radyo siteleri…) ezandan
15 saniye önce yumuşakça kısar, ezan bitince yeniden açar. Vakitler Diyanet verisidir:

Hesap veya API anahtarı gerekmez.

| Kaynak | Not |
|---|---|
| [ezanvakti.emushaf.net](https://ezanvakti.emushaf.net) | Varsayılan |
| [ezanvakti.imsakiyem.com](https://ezanvakti.imsakiyem.com) | Açık kaynak, yıllık indirme buradan, 100 istek / 5 dk |
| [namazvakti.mtopal.dev](https://namazvakti.mtopal.dev) | emushaf ile aynı biçim |

Tüm kaynaklar aynı Diyanet il/ilçe kimliklerini kullanır. Seçili kaynak çalışmazsa eklenti
konumu değiştirmeden sıradakine geçer (emushaf → imsakiyem → mtopal). Ayarlardan belirli bir
kaynak seçilebilir.

Diyanet'in resmi Awqat Salah API'si ve CollectAPI, hesap/anahtar istedikleri için kullanılmaz.

### Yıllık indirme

Konum seçilince yılın tamamı imsakiyem'den tek istekte indirilir (yaklaşık 50 KB saklanır).
Böylece eklenti yıl boyunca internete bağlanmadan çalışır.

- **Aralık ayında:** gelecek yıl günde bir denenir. Diyanet yayınlayana kadar boş döner.
- **Yıllık indirme başarısızsa ya da 5 günden az veri kaldıysa:** aylık kaynaklara geçilir
  (emushaf → imsakiyem → mtopal).

## Gizlilik

Gizlilik politikası: https://enzifiri.github.io/ezan-vakti-ses-kisici/gizlilik.html

## Kurulum (geliştirici modu)

1. Chrome'da `chrome://extensions` adresini açın.
2. Sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** → bu klasörü seçin.
4. Açılan ayarlar sayfasında il ve ilçenizi seçin.
5. Eklenti simgesine tıklayıp **Test et** ile deneyin (müzik çalarken).

## Nasıl çalışır

| Zaman | Ne olur |
|---|---|
| Ezandan *N* sn önce | Bilinen müzik/video sitelerinde (YouTube, Spotify, Netflix…) ses yavaşça kısılır; diğer sitelerde sekme hemen sessize alınır |
| Ezan anı | Ses çalan sekmeler ayrıca sessize alınır (Web Audio kullanan siteler için yedek) |
| Ezan süresi sonunda | Eklentinin sessize aldığı sekmeler açılır, ses yumuşakça eski seviyesine çıkar |

Varsayılan ezan süreleri (ayarlardan değiştirilebilir): sabah 5 dk (en uzun ezan), öğle, ikindi ve
yatsı 3 dk, akşam 2 dk (en kısa ezan).

- Ezan sırasında yeni bir sekmede ses başlarsa o da susturulur.
- Popup'taki **Sesi şimdi aç** o vakti atlar.
- "Sesi kıs ve duraklat" modunda medya duraklatılır, ezan sonunda kaldığı yerden devam eder.

## Dosyalar

- `src/background.js` — zamanlama (chrome.alarms), sekme kısma/açma
- `src/sources.js` — kaynak listesi, seçim ve sırayla deneme
- `src/timesCache.js` — önce yıllık, sonra aylık önbellek mantığı
- `src/mirror.js` — emushaf ve mtopal istemcisi (aynı biçim)
- `src/imsakiyem.js` — imsakiyem istemcisi
- `src/fader.js` — sekmelere enjekte edilen fade fonksiyonu
- `src/popup/`, `src/options/` — arayüz

## Bilinen sınırlar

- Ücretsiz servisler gayriresmidir; kapanabilir veya değişebilir. Vakitler yıl sonuna
  kadar saklandığı ve aylık kaynaklar arasında yedekleme olduğu için kesintilerden etkilenmez.
- Sadece Chrome içindeki sesleri etkiler; Spotify masaüstü uygulaması gibi tarayıcı dışı
  programlara erişemez.
- Saatler bilgisayarın yerel saatine göre hesaplanır (Türkiye saat diliminde olduğunuz varsayılır).
