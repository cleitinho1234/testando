// sw.js atualizado para ser mais persistente
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// Tenta manter o SW vivo para ouvir as mensagens vindas do servidor (se você usar WebPush no futuro)
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'Nova Mensagem', body: 'Clique para ver' };
    const options = {
        body: data.body,
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200]
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

// O que você já tem: mostra notificação vinda do script.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const options = {
            body: event.data.body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [200, 100, 200],
            tag: 'renovavel', // Evita notificações duplicadas
            renotify: true
        };
        self.registration.showNotification(event.data.title, options);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
