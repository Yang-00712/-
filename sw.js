const CACHE='log-mobile-shell-4';
const ASSETS=['./','./index.html','./app.css','./app.mjs','./domain.mjs','./storage.mjs','./import-worker.js','./solver-worker.mjs','./vendor/xlsx.mini.min.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
// Atomic app-shell install. An update waits until old tabs close; no mid-job reload.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('log-mobile-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(event.request.mode==='navigate')return await cache.match('./index.html')||fetch(event.request);return await cache.match(event.request)||fetch(event.request);})());});
