const CACHE_NAME='cuidado-dona-nair-v62';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./logo.jpg','./firebase-config.js','./alarm.js','./notifications.js'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{
    const copy=res.clone();
    caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)).catch(()=>{});
    return res;
  }).catch(()=>cached)));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clientsArr=>{
    for(const c of clientsArr){if('focus'in c)return c.focus();}
    if(self.clients.openWindow)return self.clients.openWindow('./index.html');
  }));
});
