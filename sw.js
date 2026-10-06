// 前鎮清運 離線快取
// 邏輯:每次連網都嘗試抓最新版(4秒內),成功就更新快取;
//      超時、完全沒訊號、或伺服器出錯,就退回手機裡存好的舊版,確保App一定打得開
const CACHE_NAME = 'qianzhen-cleanup-v5.72';
const CORE_ASSETS = [
  './',
  './index.html',
];
const NETWORK_TIMEOUT_MS = 4000;
// 圖片(路線圖、手繪圖)另外放一個快取,升版時不會被清掉,看過一次之後就從手機直接讀
const IMG_CACHE = 'qianzhen-img-v1';
const isImage = (url) => /\.(jpe?g|png|webp|gif)$/i.test(url.pathname);

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
        keys.filter((k) => k !== CACHE_NAME && k !== IMG_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求(頁面本身、圖示等),不快取其他動作
  if (event.request.method !== 'GET') return;
  // 外部網站的請求(例如天氣 API)不經過這裡,直接交給瀏覽器;
  // 天氣的離線備援由 index.html 自己用 localStorage 處理,
  // 避免逾時時拿到舊天氣卻被當成新資料,或拿到 index.html 被當成天氣資料
  if (new URL(event.request.url).origin !== self.location.origin) return;

  const req = event.request;
  const isPage = req.mode === 'navigate';

  // 圖片:手機裡有就馬上顯示(不等網路),同時在背景抓新版更新快取;
  // 手機裡沒有才等網路。這樣同一張圖第二次打開幾乎是瞬間,訊號差也不會卡
  if (isImage(new URL(req.url))) {
    // 快取用「不含 ?r=… 的網址」當鑰匙:重新載入(加了 ?r=時間)抓到的圖,也存成同一張,下次離線也看得到
    const u = new URL(req.url);
    const key = u.origin + u.pathname;
    event.respondWith(caches.open(IMG_CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const update = fetch(req, { cache: u.search ? 'reload' : 'default' }).then((res) => {
        if (res.ok && res.status !== 206) cache.put(key, res.clone()).catch(() => {});
        return res;
      });
      if (cached) {
        event.waitUntil(update.then(() => {}, () => {}));
        return cached;
      }
      return update.catch(() => Response.error());
    }));
    return;
  }

  // 手機裡存的版本;打開頁面找不到時用 index.html 頂替(圖片等其他檔案不頂替,免得拿到網頁當圖片)
  const fromCache = () => caches.match(req, { ignoreSearch: isPage })
    .then((c) => c || (isPage ? caches.match('./index.html') : undefined));

  // 網路版本:只有「成功」(200 這類)才存進快取,
  // 伺服器出錯(例如 GitHub Pages 偶發 404/503)不會蓋掉手機裡好的版本
  const network = fetch(req).then((res) => {
    if (res.ok && res.status !== 206) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
    }
    return res;
  });
  // 就算已經逾時先用了舊版,網路回來後仍在背景把快取更新成新版
  event.waitUntil(network.then(() => {}, () => {}));

  event.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; clearTimeout(timer); resolve(r); } };

    // 超時保險:4秒內網路沒回應,有舊版就先用舊版,不讓使用者一直等;
    // 手機裡也沒有的話就繼續等網路
    const timer = setTimeout(() => { fromCache().then(finish); }, NETWORK_TIMEOUT_MS);

    network
      .then((res) => {
        if (res.ok) return finish(res);
        // 伺服器出錯 → 有舊版就用舊版,沒有才顯示錯誤頁
        return fromCache().then((c) => finish(c || res));
      })
      .catch(() => fromCache().then((c) => finish(c || Response.error())));
  }));
});
