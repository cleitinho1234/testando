// Este arquivo fica rodando em segundo plano
const CACHE_NAME = 'minizap-v1';

self.addEventListener('install', (e) => {
    console.log('Service Worker: Instalado');
});

// Listener para mensagens (Opcional para o futuro)
self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/logo.png'
    });
});
