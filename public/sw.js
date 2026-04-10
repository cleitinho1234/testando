// sw.js - Versão Atualizada
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Isso aqui é o que faz o ícone reagir
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_BADGE') {
        const count = event.data.count;
        if (navigator.setAppBadge) {
            navigator.setAppBadge(count);
        }
    }
});
