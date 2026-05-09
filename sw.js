const CACHE_NAME = 'otter-manager-v1';
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

// 安装阶段：缓存所有资源，并立即激活不等待
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // ✅ 新SW安装后立即接管，不等旧SW退出
});

// ✅ 激活阶段：清除旧版本缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // 不是当前版本的全部删掉
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // ✅ 立即控制所有已打开的页面
});

// 拦截请求：有缓存用缓存，没有就联网取
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
