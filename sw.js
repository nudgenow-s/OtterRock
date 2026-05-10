const CACHE_NAME = 'otter-manager-v3';
const ASSETS = [
  './',
  './gate.html',
  './index.html',
  './main.html',
  './accounting.js',
  './dashboard.js',
  './engine.js',
  './manifest.json'
];

// 安装：缓存所有资源，并立即激活新版本（不等旧页面关闭）
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // 新SW立即接管
  );
});

// 激活：清除所有旧版本缓存（localStorage不受影响）
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // 只删旧版缓存，不碰localStorage
          }
        })
      );
    }).then(() => self.clients.claim()) // 立即接管所有已打开的页面
  );
});

// 网络优先：优先从服务器拉最新代码，离线时才用缓存兜底
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // 拿到新资源后，顺手更新缓存
        const cloned = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
        return networkResponse;
      })
      .catch(() => {
        // 无网络时，从缓存取
        return caches.match(e.request);
      })
  );
});
