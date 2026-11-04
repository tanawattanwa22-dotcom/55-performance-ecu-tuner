/*
 * Isolated offline Flash SW: scope /flash_port/offline/ ONLY.
 * Never controls the existing online Flash Bench or the main tuning app.
 * Pin a complete coherent version of our flash JS for loss-of-network use.
 */
const VERSION='55perf-offline-flash-v36.3';
const ASSETS=[
 './index.html',
 './manifest.webmanifest',
 '../../icons/icon-192.png',
 '../../icons/icon-512.png',
 '../offline-license.js',
 '../ftdi-webusb.js',
 '../main-reset-count.js',
 '../honda-write-engine.js',
 '../main-programming-probe.js',
 '../main-source-family-hints.js',
 '../main-dat-reference.js',
 '../main-source-bin-locks.js',
 '../flash-frames.js',
 '../csharp-logic.js',
 '../csharp-offsets.js',
 '../csharp-ecu-catalog.js',
 '../../data/ecu-catalog-290.json', // Required by Main C# ECU ID lookup in both online/offline flash
 '../bin-tools.js',
 '../bin-id-table.js',
 '../../license-config.js',
 '../../license-client.js',
 '../../ui/neon-tools-v20.css'
];
const ABS=ASSETS.map(p=>new URL(p,self.registration.scope).href);
const ALLOWED=new Set(ABS.map(u=>new URL(u).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 await cache.addAll(ABS.map(url=>new Request(url,{cache:'reload'})));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(n=>n.startsWith('55perf-offline-flash-')&&n!==VERSION).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||!ALLOWED.has(url.pathname))return;
 // Cache-first guarantees the emulator and engine stay the same revision during a flash.
 event.respondWith(caches.open(VERSION).then(async c=>{
  const cached=await c.match(event.request,{ignoreSearch:true});
  if(cached)return cached;
  // A missing safety-critical bundle file is a hard failure offline, not a demo fallback.
  return fetch(event.request,{cache:'no-store'});
 }));
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='55_CHECK_OFFLINE_CACHE'||!event.ports?.[0])return;
 event.waitUntil((async()=>{
  const cache=await caches.open(VERSION);
  const missing=[];
  for(const url of ABS)if(!await cache.match(url,{ignoreSearch:true}))missing.push(new URL(url).pathname);
  event.ports[0].postMessage({ok:missing.length===0,missing,version:VERSION,files:ABS.length});
 })());
});
