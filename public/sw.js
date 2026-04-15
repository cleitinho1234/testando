// sw.js - Service Worker para Z-Core (Persistente)

// Instalação: Força o Service Worker a assumir o controle imediatamente
self.addEventListener('install', (e) => {
    console.log('SW: Instalando e pulando espera...');
    self.skipWaiting();
});

// Ativação: Garante que o SW controle todas as abas abertas assim que ativar
self.addEventListener('activate', (e) => {
    console.log('SW: Ativado e controlando clientes.');
    e.waitUntil(clients.claim());
});

// --- NOTIFICAÇÕES VIA PUSH (Servidor) ---
// Tenta manter o SW vivo para ouvir as mensagens vindas do servidor
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'Nova Mensagem', body: 'Clique para ver' };
    const options = {
        body: data.body,
        icon: '/logo.png', // Certifique-se que este arquivo existe na raiz
        badge: '/logo.png',
        vibrate: [200, 100, 200]
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

// --- NOTIFICAÇÕES VIA SCRIPT (Internas) ---
// Mostra notificação vinda do script.js através de postMessage
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const options = {
            body: event.data.body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [200, 100, 200],
            tag: 'renovavel', // Evita notificações duplicadas empilhando-as
            renotify: true
        };
        self.registration.showNotification(event.data.title, options);
    }
});

// --- CLIQUE NA NOTIFICAÇÃO ---
// Quando o usuário clica na notificação, abre o site/app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Se o site já estiver aberto, foca nele
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) return client.focus();
            }
            // Se não estiver aberto, abre uma nova janela
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});

// --- INTERCEPTAÇÃO DE REQUISIÇÕES (Necessário para PWA) ---
self.addEventListener('fetch', (event) => {
    // Mantém o site funcionando online normalmente
    event.respondWith(fetch(event.request).catch(() => {
        // Aqui você poderia retornar uma página offline se quisesse
    }));
});
