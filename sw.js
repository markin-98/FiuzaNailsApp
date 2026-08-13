// Service Worker da Fiuza Nails — só existe pra receber notificações push
// (novo agendamento, Pix confirmado, cancelamento, lembretes 24h/1h) mesmo
// com o app fechado. Não faz cache de nada — o app já usa cache-busting
// (?v=N) nos arquivos, um SW com cache aqui só ia complicar sem necessidade.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Fiuza Nails', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Fiuza Nails 💅';
  const options = {
    body: data.body || '',
    icon: data.icon || 'fabiana.jpg',
    badge: data.badge || 'fabiana.jpg',
    tag: data.tag || 'fiuza-nails',
    renotify: !!data.tag,
    data: { url: data.url || './index.html', tab: data.tab || null },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação: se o app já está aberto numa aba, manda mensagem
// pro app trocar de tela sozinho (sem recarregar); senão abre uma janela nova
// já com a aba certa na URL (?tab=...), que o app lê ao carregar.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  const tab = event.notification.data && event.notification.data.tab;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if (tab) client.postMessage({ type: 'push-navigate', tab });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
