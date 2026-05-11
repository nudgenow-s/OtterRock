// ── 獭掌柜 · Service Worker ──────────────────────────────────────────────
// 策略：网络优先，离线兜底
// ⚠️ 每次发布前把下面的日期改成当天，格式 otter-v年月日
// 例：2026年5月10日发布 → 'otter-v20260510'

const CACHE_NAME = 'otter-v20260517';

const ASSETS = [
  './',
  './gate.html',
  './index.html',
  './main.html',
  './accounting.js',
  './dashboard.js',
  './engine.js',
  './manifest.json',
];

// ── 安装：缓存所有资源，立即激活 ────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── 激活：清除旧缓存，通知所有页面刷新 ───────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll({ type: 'window' }))
     .then((clients) => clients.forEach(c => c.postMessage('SW_UPDATED')))
  );
});

// ── Fetch：网络优先，失败走缓存 ──────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  // 只处理 GET，跳过 POST/API 请求
  if (e.request.method !== 'GET') return;

  // 跳过跨域请求（CDN、API、ipapi 等），不缓存
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 只缓存正常响应
        if (res && res.status === 200) {
          const cloned = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── 收到主线程消息：强制跳过等待 ────────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
