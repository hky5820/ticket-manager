/* 티켓 보관함 서비스워커 — 앱 셸 캐시(오프라인 지원) */
const CACHE='tm-shell-v12';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-180.png','./icon-maskable-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>{}));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;                 // Supabase 쓰기/인증은 그냥 네트워크로
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;        // Supabase API / CDN 은 캐시하지 않음
  // 같은 출처(앱 셸): 네트워크 우선, 실패 시 캐시 (오프라인)
  e.respondWith(
    fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
});
