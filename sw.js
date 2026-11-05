// 55 PERFORMANCE ECU TUNER — v18 inline
// Authentication and navigation are network-only to prevent outdated login/signup code.
const CACHE_NAME='55ecu-static-v19-neon-mobile-icon-20261105';
const STATIC_FILES=['./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-64.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('55ecu-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 const critical=event.request.mode==='navigate'||/\/(?:index\.html|license-client\.js|license-config\.js|sw\.js)$/.test(url.pathname);
 if(critical){event.respondWith(fetch(event.request,{cache:'no-store'}));return;}
 if(STATIC_FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname)){
  event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)));}
   return response;
  }).catch(()=>caches.match(event.request)));
 }
});
