// 前鎮清運 離線快取
// 邏輯:每次連網都嘗試抓最新版(4秒內),成功就更新快取;
//      超時或完全沒訊號就退回手機裡存好的舊版,確保App一定打得開
const CACHE_NAME = 'qianzhen-cleanup-v4.0';
const CORE_ASSETS = [
  './',
  './index.html',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求(頁面本身、圖示等),不快取其他動作
  if (event.request.method !== 'GET') return;

  event.respondWith(
    new Promise((resolve) => {
      let settled = false;

      // 超時保險:4秒內網路沒回應,就直接用快取版本,不讓使用者一直等
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        caches.match(event.request).then((cached) => {
          resolve(cached || caches.match('./index.html'));
        });
      }, NETWORK_TIMEOUT_MS);

      fetch(event.request)
        .then((networkRes) => {
          if (settled) return; // 已經逾時退回快取了,這次網路回應就不用了
          settled = true;
          clearTimeout(timer);
          // 連網成功,更新快取存一份最新的,下次離線才有最新版可用
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          resolve(networkRes);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          caches.match(event.request).then((cached) => {
            resolve(cached || caches.match('./index.html'));
          });
        });
    })
  );
});
