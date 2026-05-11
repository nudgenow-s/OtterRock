// ── 獭掌柜 · 收银 & 库存录入 accounting.js ──────────────────────────────
// 依赖 engine.js (window.Engine)
// 新增：扫码录入功能（Cloudflare Worker + D1）

// ══════════════════════════════════════════════════════════════════════════
//  ⚙️  配置区：部署后将此处替换为你的 Worker URL
// ══════════════════════════════════════════════════════════════════════════
const BARCODE_API = 'https://your-worker.your-subdomain.workers.dev';

// ══════════════════════════════════════════════════════════════════════════
//  扫码模块 — 优先用原生 BarcodeDetector（Safari/Chrome 系统级识别率）
//             不支持时降级到 html5-qrcode
// ══════════════════════════════════════════════════════════════════════════
const BarcodeScanner = (function () {
  let _onDetect  = null;
  let _overlayEl = null;
  let _stream    = null;
  let _videoEl   = null;
  let _rafId     = null;       // requestAnimationFrame id
  let _scanner   = null;       // html5-qrcode 降级实例
  let _scanning  = false;
  let _lastFired = '';
  let _lastTime  = 0;

  // ── 防重复触发 ────────────────────────────────────────────────────
  function _dedupe(code) {
    const now = Date.now();
    if (code === _lastFired && now - _lastTime < 1500) return;
    _lastFired = code;
    _lastTime  = now;
    _beep();
    _setStatus('✅ 识别：' + code);
    _stop();
    if (_onDetect) _onDetect(code);
  }

  // ── 滴声 ──────────────────────────────────────────────────────────
  function _beep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch(e) {}
  }

  // ── DOM ───────────────────────────────────────────────────────────
  function _ensureOverlay() {
    if (_overlayEl) return;
    _overlayEl = document.createElement('div');
    _overlayEl.id = 'barcode-overlay';
    _overlayEl.innerHTML = `
      <div id="bco-inner">
        <div id="bco-header">
          <div id="bco-title">📷 扫描商品条形码</div>
          <div id="bco-hint">手机离条形码 15-20cm，保持稳定</div>
        </div>
        <div id="bco-viewport">
          <video id="bco-video" autoplay muted playsinline></video>
          <div id="bco-frame">
            <span class="bco-corner tl"></span>
            <span class="bco-corner tr"></span>
            <span class="bco-corner bl"></span>
            <span class="bco-corner br"></span>
            <div id="bco-scanline"></div>
          </div>
          <!-- 降级时 html5-qrcode 挂这里 -->
          <div id="bco-reader" style="display:none;width:100%;height:100%;"></div>
        </div>
        <div id="bco-status">正在启动摄像头…</div>
        <div id="bco-manual-row">
          <input id="bco-manual-inp" type="text" inputmode="numeric"
                 placeholder="或手动输入条形码" autocomplete="off">
          <button id="bco-manual-btn">查询</button>
        </div>
        <button id="bco-close">✕ 关闭</button>
      </div>
    `;
    document.body.appendChild(_overlayEl);
    _injectStyles();
    _videoEl = _overlayEl.querySelector('#bco-video');
    _overlayEl.querySelector('#bco-close').onclick = close;
    _overlayEl.querySelector('#bco-manual-btn').onclick = () => {
      const v = _overlayEl.querySelector('#bco-manual-inp').value.trim();
      if (v) _dedupe(v);
    };
    _overlayEl.querySelector('#bco-manual-inp').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = _overlayEl.querySelector('#bco-manual-inp').value.trim();
        if (v) _dedupe(v);
      }
    });
  }

  function _injectStyles() {
    if (document.getElementById('bco-styles')) return;
    const s = document.createElement('style');
    s.id = 'bco-styles';
    s.textContent = `
      #barcode-overlay {
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,.92); z-index:9999;
        align-items:center; justify-content:center;
      }
      #barcode-overlay.open { display:flex; animation:bcoFadeIn .2s ease; }
      @keyframes bcoFadeIn { from{opacity:0} to{opacity:1} }

      #bco-inner {
        display:flex; flex-direction:column; align-items:center;
        padding:20px 16px 28px; width:100%; max-width:380px;
      }
      #bco-header { text-align:center; margin-bottom:14px; }
      #bco-title  { color:#fff; font-size:19px; font-weight:900; }
      #bco-hint   { color:rgba(255,255,255,.6); font-size:12px; margin-top:5px; }

      #bco-viewport {
        position:relative;
        width:100%; max-width:360px;
        aspect-ratio:4/3;
        border-radius:16px; overflow:hidden; background:#000;
      }
      #bco-video {
        width:100%; height:100%; object-fit:cover; display:block;
      }
      #bco-frame {
        position:absolute; inset:0; pointer-events:none;
      }
      .bco-corner {
        position:absolute; width:28px; height:28px;
        border-color:#FF6B35; border-style:solid;
      }
      .bco-corner.tl { top:16px;  left:16px;  border-width:3px 0 0 3px; border-radius:4px 0 0 0; }
      .bco-corner.tr { top:16px;  right:16px; border-width:3px 3px 0 0; border-radius:0 4px 0 0; }
      .bco-corner.bl { bottom:16px; left:16px;  border-width:0 0 3px 3px; border-radius:0 0 0 4px; }
      .bco-corner.br { bottom:16px; right:16px; border-width:0 3px 3px 0; border-radius:0 0 4px 0; }

      #bco-scanline {
        position:absolute; left:16px; right:16px; height:2px;
        background:linear-gradient(90deg,transparent,#FF6B35,transparent);
        animation:bcoScan 2s ease-in-out infinite;
      }
      @keyframes bcoScan {
        0%   { top:16px; opacity:0; }
        10%  { opacity:1; }
        90%  { opacity:1; }
        100% { top:calc(100% - 18px); opacity:0; }
      }

      #bco-status {
        color:rgba(255,255,255,.8); font-size:13px; font-weight:700;
        margin-top:14px; min-height:18px; text-align:center;
      }
      #bco-manual-row {
        display:flex; gap:8px; margin-top:14px; width:100%; max-width:360px;
      }
      #bco-manual-inp {
        flex:1; background:rgba(255,255,255,.1);
        border:1.5px solid rgba(255,255,255,.25); border-radius:10px;
        padding:10px 12px; font-size:14px; color:#fff; outline:none;
        font-family:inherit;
      }
      #bco-manual-inp::placeholder { color:rgba(255,255,255,.35); }
      #bco-manual-btn {
        background:#FF6B35; border:none; border-radius:10px;
        padding:10px 16px; color:#fff; font-size:14px; font-weight:900;
        cursor:pointer; font-family:inherit;
      }
      #bco-close {
        margin-top:18px; background:rgba(255,255,255,.1);
        border:1.5px solid rgba(255,255,255,.2); color:#fff;
        padding:11px 36px; border-radius:30px;
        font-size:15px; font-weight:700; cursor:pointer; font-family:inherit;
      }
      .f-name-wrap { position:relative; display:flex; align-items:center; }
      .f-name-wrap .form-inp { padding-right:52px; }
      .scan-trigger-btn {
        position:absolute; right:6px; width:38px; height:38px;
        background:#FF6B35; border:none; border-radius:10px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; flex-shrink:0;
        transition:transform .12s; box-shadow:0 3px 0 #C44D1A;
      }
      .scan-trigger-btn:active { transform:translateY(2px); box-shadow:0 1px 0 #C44D1A; }
      .scan-trigger-btn svg { width:19px; height:19px; }
      .f-barcode-tag { font-size:11px; font-weight:700; color:#999; margin-top:4px; display:none; }
      .f-barcode-tag.show { display:block; }
      .f-barcode-tag span { color:#FF6B35; }
      @keyframes autoFill {
        0%   { background:#FFF3EE; border-color:#FF6B35; }
        100% { background:#fff;    border-color:#EBEBEB; }
      }
      .auto-filled { animation:autoFill 1.8s ease forwards; }
    `;
    document.head.appendChild(s);
  }

  function _setStatus(msg) {
    if (_overlayEl) _overlayEl.querySelector('#bco-status').textContent = msg;
  }

  // ── 停止所有扫描 ──────────────────────────────────────────────────
  function _stop() {
    _scanning = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if (_videoEl) _videoEl.srcObject = null;
    if (_scanner) { _scanner.stop().catch(() => {}); _scanner = null; }
  }

  // ── 方案A：原生 BarcodeDetector ──────────────────────────────────
  function _startNative() {
    const detector = new BarcodeDetector({
      formats: ['ean_13','ean_8','code_128','code_39','upc_a','upc_e'],
    });

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(stream => {
      _stream = stream;
      _videoEl.srcObject = stream;
      _videoEl.style.display = 'block';
      _overlayEl.querySelector('#bco-reader').style.display = 'none';

      _videoEl.onloadedmetadata = () => {
        _videoEl.play().then(() => {
          _setStatus('🔍 对准条形码，手机离远一点效果更好…');

          // 用 canvas 逐帧截图再检测，比直接传 video 在 Safari PWA 更可靠
          const canvas  = document.createElement('canvas');
          const ctx2d   = canvas.getContext('2d');

          function scan() {
            if (!_scanning) return;
            if (_videoEl.readyState < 2 || _videoEl.paused) {
              _rafId = requestAnimationFrame(scan);
              return;
            }

            canvas.width  = _videoEl.videoWidth;
            canvas.height = _videoEl.videoHeight;
            ctx2d.drawImage(_videoEl, 0, 0);

            createImageBitmap(canvas).then(bitmap => {
              return detector.detect(bitmap).then(codes => {
                bitmap.close();
                if (codes.length > 0) _dedupe(codes[0].rawValue);
              });
            }).catch(() => {}).finally(() => {
              if (_scanning) _rafId = requestAnimationFrame(scan);
            });
          }

          _rafId = requestAnimationFrame(scan);
        });
      };
    }).catch(err => {
      _setStatus('⚠️ 摄像头启动失败，请手动输入');
      console.warn('[BarcodeScanner native]', err);
    });
  }

  // ── 方案B：html5-qrcode 降级 ─────────────────────────────────────
  function _startFallback() {
    _videoEl.style.display = 'none';
    const readerEl = _overlayEl.querySelector('#bco-reader');
    readerEl.style.display = 'block';
    readerEl.innerHTML = '';

    function _loadLib(cb) {
      if (window.Html5Qrcode) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = cb;
      s.onerror = () => _setStatus('⚠️ 扫码库加载失败，请手动输入');
      document.head.appendChild(s);
    }

    _loadLib(() => {
      try { _scanner = new Html5Qrcode('bco-reader'); } catch(e) {
        _setStatus('⚠️ 初始化失败，请手动输入'); return;
      }
      _scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (w, h) => ({ width: Math.round(w * 0.85), height: Math.round(h * 0.35) }),
          aspectRatio: 1.333,
          supportedScanTypes: [ Html5QrcodeScanType.SCAN_TYPE_CAMERA ],
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
          ],
        },
        (code) => { if (_scanner) _dedupe(code); },
        () => {}
      ).then(() => {
        _setStatus('🔍 对准条形码，手机离远一点效果更好…');
      }).catch(err => {
        _setStatus('⚠️ 摄像头启动失败，请手动输入');
        console.warn('[BarcodeScanner fallback]', err);
      });
    });
  }

  // ── open ──────────────────────────────────────────────────────────
  function open(onDetectCb) {
    _onDetect = onDetectCb;
    _ensureOverlay();
    _overlayEl.classList.add('open');
    _overlayEl.querySelector('#bco-manual-inp').value = '';
    _lastFired = ''; _lastTime = 0;

    if (_scanning) { _stop(); }
    _scanning = true;
    _setStatus('正在启动摄像头…');

    // 优先用原生 BarcodeDetector（Safari 16.4+ / Chrome 83+）
    if (window.BarcodeDetector) {
      BarcodeDetector.getSupportedFormats().then(formats => {
        if (formats.includes('ean_13') || formats.includes('code_128')) {
          _setStatus('✨ 使用系统级扫码引擎…');
          _startNative();
        } else {
          _startFallback();
        }
      }).catch(() => _startFallback());
    } else {
      _startFallback();
    }
  }

  function close() {
    _stop();
    if (_overlayEl) _overlayEl.classList.remove('open');
  }

  return { open, close };
})();

window.BarcodeScanner = BarcodeScanner;

// ══════════════════════════════════════════════════════════════════════════
//  Cloudflare 条码数据库查询 / 上报
// ══════════════════════════════════════════════════════════════════════════
const BarcodeDB = (function () {

  // 获取用户大致地区（IP 定位，失败则用"未知"）
  let _region = null;
  async function getRegion() {
    if (_region) return _region;
    try {
      const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      _region = [d.region || '', d.city || ''].filter(Boolean).join('-') || '未知';
    } catch {
      _region = '未知';
    }
    return _region;
  }

  // 查询条形码 → { found, name, salePrice, category }
  async function query(barcode) {
    const region = await getRegion();
    const url = `${BARCODE_API}/api/product/${encodeURIComponent(barcode)}?region=${encodeURIComponent(region)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // 上报入库数据（入库成功后调用，丰富数据库）
  // payload: { barcode, name, category, costPrice, salePrice, qty, expireDate }
  // 上报内容包括进价，供数据库记录完整成本数据
  // 无条码时仍上报入库明细（inventory 表），但不写 products 参考表
  async function report(payload) {
    const region = await getRegion();
    fetch(`${BARCODE_API}/api/inventory`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...payload, region }),
    }).catch(() => {});   // 静默失败，不影响本地流程
  }

  return { query, report, getRegion };
})();

window.BarcodeDB = BarcodeDB;

// ══════════════════════════════════════════════════════════════════════════
//  Accounting 模块
// ══════════════════════════════════════════════════════════════════════════
const Accounting = (function () {

// ════════════════════════════════════════════════════════════════════════
//  开始收银（不变）
// ════════════════════════════════════════════════════════════════════════
function renderCashier(container) {
  let cart = [];

  container.innerHTML = `
    <div class="page-cashier">
      <div class="page-title-bar">
        <span class="page-title-icon">🛒</span>
        <span class="page-title-text">开始收银</span>
      </div>
      <div class="search-wrap">
        <div class="search-box" style="position:relative;">
          <span class="search-ico">🔍</span>
          <input id="cashier-search" class="search-inp" type="text"
                 placeholder="搜索商品名称…" autocomplete="off"
                 style="padding-right:52px;">
          <!-- 扫码按钮 -->
          <button class="scan-trigger-btn" style="position:absolute;right:6px;"
                  title="扫描条形码" onclick="Accounting._cashierScan()">
            <svg viewBox="0 0 24 24" fill="none"
                 stroke="#fff" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="2"  y="4" width="2"  height="16" rx=".4"/>
              <rect x="6"  y="4" width="1"  height="16" rx=".4"/>
              <rect x="9"  y="4" width="2"  height="16" rx=".4"/>
              <rect x="13" y="4" width="1"  height="16" rx=".4"/>
              <rect x="16" y="4" width="2"  height="16" rx=".4"/>
              <rect x="20" y="4" width="2"  height="16" rx=".4"/>
            </svg>
          </button>
        </div>
        <div id="cashier-dropdown" class="search-dropdown hidden"></div>
      </div>
      <div class="section-label">已选商品</div>
      <div id="cashier-cart" class="cart-list"></div>
      <div class="cashier-total-bar" id="cashier-total-bar">
        <div class="ct-left">
          <div class="ct-items" id="ct-items">0 件商品</div>
          <div class="ct-total" id="ct-total">¥0.00</div>
        </div>
        <button class="ct-btn" id="ct-btn" onclick="Accounting._submitSale()">出售</button>
      </div>
      <div id="cashier-success" class="sale-success hidden">
        <div class="ss-icon">🎉</div>
        <div class="ss-text">出售成功！</div>
        <div class="ss-sub" id="ss-sub"></div>
      </div>
    </div>
  `;

  const inp = container.querySelector('#cashier-search');
  const dd  = container.querySelector('#cashier-dropdown');

  // ── 扫码加入购物车 ────────────────────────────────────────────────
  Accounting._cashierScan = () => {
    BarcodeScanner.open((code) => {
      BarcodeScanner.close();

      // 在本地库存里用条形码匹配（barcode 字段，录入时已保存）
      const inv  = Engine.getInventory().filter(p => parseFloat(p.qty) > 0);
      const prod = inv.find(p => p.barcode === code);

      if (prod) {
        // 找到了：填入搜索框名称 + 直接加入购物车
        inp.value = prod.name;
        addToCart(prod);
        inp.value = '';
        _showToast('✅ 已加入：' + prod.name);
      } else {
        // 没找到：把条形码填入搜索框，让用户看到提示
        inp.value = '';
        _showToast('⚠️ 库存中没有条码 ' + code + ' 的商品，请先录入');
      }
    });
  };

  // ── 文字搜索 ──────────────────────────────────────────────────────
  inp.addEventListener('input', () => {
    const q   = inp.value.trim().toLowerCase();
    const inv = Engine.getInventory().filter(p => parseFloat(p.qty) > 0);
    if (!q) { dd.classList.add('hidden'); return; }
    // 同时支持按商品名称和条形码搜索
    const results = inv.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    );
    dd.innerHTML = results.length
      ? results.map(p => `<div class="dd-item" data-id="${p.id}"><span class="dd-name">${p.name}</span><span class="dd-info">库存${p.qty}件 · ${Engine.fmtMoney(p.salePrice)}</span></div>`).join('')
      : '<div class="dd-empty">没有找到商品</div>';
    dd.querySelectorAll('.dd-item').forEach(el => {
      el.onclick = () => {
        const prod = inv.find(p => p.id == el.dataset.id);
        if (prod) addToCart(prod);
        inp.value = ''; dd.classList.add('hidden');
      };
    });
    dd.classList.remove('hidden');
  });

  document.addEventListener('click', e => {
    if (!container.querySelector('.search-wrap').contains(e.target)) dd.classList.add('hidden');
  });

  function addToCart(prod) {
    const existing = cart.find(c => c.productId === prod.id);
    if (existing) {
      existing.qty = Math.min(existing.qty + 1, parseFloat(prod.qty));
    } else {
      cart.push({ productId: prod.id, name: prod.name, qty: 1,
        costPrice: parseFloat(prod.costPrice), salePrice: parseFloat(prod.salePrice),
        maxQty: parseFloat(prod.qty) });
    }
    renderCart();
  }

  function renderCart() {
    const el = container.querySelector('#cashier-cart');
    el.innerHTML = cart.length
      ? cart.map((item, i) => `
          <div class="cart-item">
            <div class="ci-info">
              <div class="ci-name">${item.name}</div>
              <div class="ci-price">${Engine.fmtMoney(item.salePrice)} / 件</div>
            </div>
            <div class="ci-qty-ctrl">
              <button class="qty-btn" onclick="Accounting._cartQty(${i},-1)">−</button>
              <span class="qty-val">${item.qty}</span>
              <button class="qty-btn" onclick="Accounting._cartQty(${i},1)">+</button>
            </div>
            <div class="ci-subtotal">${Engine.fmtMoney(item.salePrice * item.qty)}</div>
            <button class="ci-del" onclick="Accounting._cartDel(${i})">✕</button>
          </div>`)
        .join('')
      : '<div class="cart-empty">搜索或扫码添加商品 🛍️</div>';
    updateTotal();
  }

  function updateTotal() {
    const total = cart.reduce((a, c) => a + c.salePrice * c.qty, 0);
    const count = cart.reduce((a, c) => a + c.qty, 0);
    container.querySelector('#ct-items').textContent = count + ' 件商品';
    container.querySelector('#ct-total').textContent = Engine.fmtMoney(total);
    container.querySelector('#ct-btn').disabled = cart.length === 0;
  }

  Accounting._cartQty = (i, d) => { cart[i].qty = Math.max(1, Math.min(cart[i].qty + d, cart[i].maxQty)); renderCart(); };
  Accounting._cartDel = (i)    => { cart.splice(i, 1); renderCart(); };
  Accounting._submitSale = () => {
    if (!cart.length) return;
    const record = Engine.recordSale(cart);
    cart = []; renderCart();
    const su = container.querySelector('#cashier-success');
    container.querySelector('#ss-sub').textContent = '共收 ' + Engine.fmtMoney(record.total) + ' · 毛利 ' + Engine.fmtMoney(record.profit);
    su.classList.remove('hidden');
    su.style.animation = 'none';
    requestAnimationFrame(() => { su.style.animation = ''; });
    setTimeout(() => su.classList.add('hidden'), 3000);
    if (window.Dashboard && window.Dashboard.refresh) window.Dashboard.refresh();
  };

  renderCart();
}

// ════════════════════════════════════════════════════════════════════════
//  库存录入 / 进货（共用 _renderForm）
// ════════════════════════════════════════════════════════════════════════
function renderEntry(container) {
  _renderForm(container, 'entry',   '库存录入', '➕', '将现有商品录入库存系统');
}
function renderRestock(container) {
  _renderForm(container, 'restock', '进货',     '📦', '记录新到货商品，自动补充库存');
}

const CATS = ['食品饮料', '日用百货', '休闲零食', '冷冻冷藏', '酒水', '烟草', '其他'];

function _renderForm(container, source, title, icon, subtitle) {
  container.innerHTML = `
    <div class="page-form">
      <div class="page-title-bar">
        <span class="page-title-icon">${icon}</span>
        <span class="page-title-text">${title}</span>
      </div>
      <div class="form-subtitle">${subtitle}</div>

      <div class="form-card">

        <!-- ▼ 商品名称（含扫码按钮）▼ -->
        <div class="form-group">
          <label class="form-lbl">商品名称 *</label>
          <div class="f-name-wrap">
            <input id="f-name" class="form-inp" type="text"
                   placeholder="例：农夫山泉 550ml" autocomplete="off">
            <button class="scan-trigger-btn" title="扫描条形码"
                    onclick="Accounting._openScanner()">
              <!-- 条形码图标 SVG -->
              <svg viewBox="0 0 24 24" fill="none"
                   stroke="#fff" stroke-width="2.2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="2"  y="4" width="2"  height="16" rx=".4"/>
                <rect x="6"  y="4" width="1"  height="16" rx=".4"/>
                <rect x="9"  y="4" width="2"  height="16" rx=".4"/>
                <rect x="13" y="4" width="1"  height="16" rx=".4"/>
                <rect x="16" y="4" width="2"  height="16" rx=".4"/>
                <rect x="20" y="4" width="2"  height="16" rx=".4"/>
              </svg>
            </button>
          </div>
          <!-- 已扫条形码回显 -->
          <div class="f-barcode-tag" id="f-barcode-tag">
            条形码：<span id="f-barcode-val"></span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-lbl">商品分类</label>
          <div class="cat-chips" id="cat-chips">
            ${CATS.map((c, i) => `<button class="cat-chip${i===0?' active':''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label class="form-lbl">进价 (¥) *</label>
            <input id="f-cost" class="form-inp" type="number" step="0.01" min="0" placeholder="0.00">
          </div>
          <div class="form-group half">
            <label class="form-lbl">售价 (¥) *</label>
            <input id="f-sale" class="form-inp" type="number" step="0.01" min="0" placeholder="0.00">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label class="form-lbl">数量 *</label>
            <input id="f-qty" class="form-inp" type="number" min="1" step="1" placeholder="0">
          </div>
          <div class="form-group half">
            <label class="form-lbl">过期日期</label>
            <input id="f-exp" class="form-inp" type="date">
          </div>
        </div>

        <div class="margin-preview" id="margin-preview" style="display:none">
          <span class="mp-label">毛利预览</span>
          <span class="mp-unit" id="mp-unit">单件毛利 ¥—</span>
          <span class="mp-rate" id="mp-rate">毛利率 —%</span>
        </div>

      </div><!-- /form-card -->

      <button class="form-submit" id="f-submit"
              onclick="Accounting._submitForm('${source}')">
        <span>${icon}</span> 确认${title}
      </button>

      <div class="form-success hidden" id="f-success">✅ ${title}成功！</div>

      <div class="section-label" style="margin-top:24px">${title}历史</div>
      <div id="form-history" class="form-history-list"></div>
    </div>
  `;

  // 当前扫描到的条形码（供提交时上报）
  let _currentBarcode = null;

  // ── 扫码回调 ───────────────────────────────────────────────────────
  Accounting._openScanner = () => {
    BarcodeScanner.open(async (code) => {
      BarcodeScanner.close();

      // 显示条形码
      _currentBarcode = code;
      const tagEl = container.querySelector('#f-barcode-tag');
      const valEl = container.querySelector('#f-barcode-val');
      if (tagEl && valEl) { valEl.textContent = code; tagEl.classList.add('show'); }

      // 查询数据库
      try {
        const data = await BarcodeDB.query(code);
        if (data.found) {
          // 自动填入商品名称 + 进价 + 售价
          const nameEl = container.querySelector('#f-name');
          const costEl = container.querySelector('#f-cost');
          const saleEl = container.querySelector('#f-sale');
          if (nameEl) { nameEl.value = data.name; nameEl.classList.add('auto-filled'); }
          if (costEl && data.costPrice) { costEl.value = data.costPrice; costEl.classList.add('auto-filled'); }
          if (saleEl && data.salePrice) { saleEl.value = data.salePrice; saleEl.classList.add('auto-filled'); }
          // 自动选分类
          if (data.category) {
            container.querySelectorAll('.cat-chip').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.cat === data.category);
            });
          }
          _showToast('✅ 已自动填入：' + data.name);
          // 触发毛利预览更新
          container.querySelector('#f-cost').dispatchEvent(new Event('input'));
        } else {
          _showToast('📝 新商品，请填写商品信息后录入');
        }
      } catch (e) {
        _showToast('⚠️ 查询失败，请手动填写商品信息');
        console.warn('[BarcodeDB]', e);
      }
    });
  };

  // ── 分类选择 ──────────────────────────────────────────────────────
  container.querySelectorAll('.cat-chip').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  // ── 实时毛利预览 ──────────────────────────────────────────────────
  ['f-cost', 'f-sale'].forEach(id => {
    container.querySelector('#' + id).addEventListener('input', () => {
      const cost = parseFloat(container.querySelector('#f-cost').value) || 0;
      const sale = parseFloat(container.querySelector('#f-sale').value) || 0;
      const mp   = container.querySelector('#margin-preview');
      if (cost > 0 && sale > 0) {
        const profit = sale - cost;
        const rate   = Math.round(profit / sale * 100);
        mp.style.display = 'flex';
        container.querySelector('#mp-unit').textContent = '单件毛利 ' + Engine.fmtMoney(profit);
        const rateEl = container.querySelector('#mp-rate');
        rateEl.textContent = '毛利率 ' + rate + '%';
        rateEl.style.color = rate >= 20 ? '#4CAF50' : rate >= 0 ? '#FF6B35' : '#F44336';
      } else {
        mp.style.display = 'none';
      }
    });
  });

  // ── 提交 ──────────────────────────────────────────────────────────
  Accounting._submitForm = (src) => {
    const name    = container.querySelector('#f-name').value.trim();
    const cost    = parseFloat(container.querySelector('#f-cost').value);
    const sale    = parseFloat(container.querySelector('#f-sale').value);
    const qty     = parseFloat(container.querySelector('#f-qty').value);
    const expDate = container.querySelector('#f-exp').value;
    const cat     = container.querySelector('.cat-chip.active')?.dataset.cat || '其他';

    if (!name)                return _shake(container.querySelector('#f-name'),  '请填写商品名称');
    if (isNaN(cost) || cost < 0) return _shake(container.querySelector('#f-cost'), '请填写有效进价');
    if (isNaN(sale) || sale < 0) return _shake(container.querySelector('#f-sale'), '请填写有效售价');
    if (isNaN(qty)  || qty  < 1) return _shake(container.querySelector('#f-qty'),  '数量至少为1');

    // 本地存储（含条形码字段）
    Engine.addProduct({ barcode: _currentBarcode || null, name, category: cat, qty, costPrice: cost, salePrice: sale,
      expireDate: expDate, source: src, createdAt: new Date().toISOString() });

    // 上报到 Cloudflare（有条形码时才上报，静默）
    BarcodeDB.report({
      barcode:    _currentBarcode,
      name, category: cat, costPrice: cost, salePrice: sale,
      qty, expireDate: expDate,
    });

    // 重置
    ['f-name','f-cost','f-sale','f-qty','f-exp'].forEach(id => {
      container.querySelector('#' + id).value = '';
    });
    container.querySelector('#margin-preview').style.display = 'none';
    const tagEl = container.querySelector('#f-barcode-tag');
    if (tagEl) tagEl.classList.remove('show');
    _currentBarcode = null;

    // 成功提示
    const su = container.querySelector('#f-success');
    su.classList.remove('hidden');
    setTimeout(() => su.classList.add('hidden'), 2000);

    renderHistory();
    if (window.Dashboard && window.Dashboard.refresh) window.Dashboard.refresh();
  };

  // ── 历史记录 ──────────────────────────────────────────────────────
  function renderHistory() {
    const el  = container.querySelector('#form-history');
    const inv = Engine.getInventory().filter(p => p.source === source).slice(-10).reverse();
    el.innerHTML = inv.length
      ? inv.map(p => `
          <div class="hist-item">
            <div class="hi-left">
              <div class="hi-name">${p.name}</div>
              <div class="hi-meta">${p.category} · 进价${Engine.fmtMoney(p.costPrice)} · 售价${Engine.fmtMoney(p.salePrice)}</div>
            </div>
            <div class="hi-right">
              <div class="hi-qty">×${p.qty}</div>
              ${p.expireDate ? `<div class="hi-exp">到期${Engine.fmtDate(p.expireDate)}</div>` : ''}
            </div>
          </div>`).join('')
      : '<div class="hist-empty">暂无记录</div>';
  }

  renderHistory();
}

// ── 工具 ──────────────────────────────────────────────────────────────
function _shake(el, msg) {
  el.style.borderColor = '#F44336';
  el.placeholder = msg;
  el.classList.add('shake');
  setTimeout(() => { el.classList.remove('shake'); el.style.borderColor = ''; }, 600);
}

// 轻量 Toast（不依赖外部库）
function _showToast(msg) {
  let t = document.getElementById('bco-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'bco-toast';
    const ts = document.createElement('style');
    ts.textContent = `
      #bco-toast {
        position:fixed; top:72px; left:50%;
        transform:translateX(-50%) translateY(-12px);
        background:rgba(0,0,0,.78); color:#fff;
        padding:9px 18px; border-radius:20px;
        font-size:14px; font-weight:700;
        z-index:10000; opacity:0; pointer-events:none;
        transition:opacity .25s, transform .25s;
        white-space:nowrap; max-width:300px;
        font-family:'PingFang SC','Helvetica Neue',sans-serif;
      }
      #bco-toast.show {
        opacity:1; transform:translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(ts);
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

return { renderCashier, renderEntry, renderRestock };
})();

window.Accounting = Accounting;
