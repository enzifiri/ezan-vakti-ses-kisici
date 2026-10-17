// Arka plan servisine mesaj gönderir; hata varsa fırlatır.
export async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res?.ok) throw new Error(res?.error || 'Bilinmeyen hata');
  return res.data;
}
