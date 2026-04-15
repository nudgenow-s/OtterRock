const CACHE_NAME = 'otter-manager-v1';
const ASSETS = [
  './',
  './gate.html',
  './index.html',
  './main.html',
  './accounting.js',
  './manifest.json'

];

// 安装阶段：把网页存入手机“地下室”
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 核心逻辑：拦截请求。没网时，直接从地下室取货
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
