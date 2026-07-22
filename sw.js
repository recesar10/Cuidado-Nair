const CACHE_NAME='cuidado-dona-nair-v650';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./logo.jpg','./firebase-config.js','./push-client.js','./alarm.js','./notifications.js'];

try {
  importScripts('./firebase-config.js');
  const cfg = self.CUIDADO_NAIR_FIREBASE;
  if (cfg && cfg.enabled && cfg.firebaseConfig && cfg.firebaseConfig.projectId) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
    firebase.initializeApp(cfg.firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const data = payload.data || {};
      self.registration.showNotification(data.title || 'Cuidado Dona Nair', {
        body: data.body || 'Há um cuidado programado para agora.',
        icon: './icon-192.png', badge: './icon-192.png',
        tag: data.tag || 'cuidado-nair', renotify: true, requireInteraction: true,
        vibrate: [300, 150, 300, 150, 500],
        data: { url: data.url || './' }
      });
    });
  }
} catch (e) { console.error('Firebase Messaging não iniciado no service worker', e); }

self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.mode==='navigate'||(req.headers.get('accept')||'').includes('text/html')){event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put('./index.html',copy));return res}).catch(()=>caches.match('./index.html')));return}
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});return res}).catch(()=>cached)));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=(event.notification.data&&event.notification.data.url)||'./';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const client of list){if('focus'in client){client.navigate(target).catch(()=>{});return client.focus()}}return clients.openWindow?clients.openWindow(target):null}));
});
