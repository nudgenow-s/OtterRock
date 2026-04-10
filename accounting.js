// ── 獭掌柜 · 收银 & 库存录入 accounting.js ──────────────────────────────
// 依赖 engine.js (window.Engine)

const Accounting = (function () {

// ════════════════════════════════════════════════════════════════════════
//  开始收银
// ════════════════════════════════════════════════════════════════════════
function renderCashier(container) {
let cart = []; // [{ productId, name, qty, costPrice, salePrice }]

```
container.innerHTML = `
  <div class="page-cashier">
    <div class="page-title-bar">
      <span class="page-title-icon">🛒</span>
      <span class="page-title-text">开始收银</span>
    </div>

    <!-- 搜索 -->
    <div class="search-wrap">
      <div class="search-box">
        <span class="search-ico">🔍</span>
        <input id="cashier-search" class="search-inp" type="text" placeholder="搜索商品名称…" autocomplete="off">
      </div>
      <div id="cashier-dropdown" class="search-dropdown hidden"></div>
    </div>

    <!-- 购物车 -->
    <div class="section-label">已选商品</div>
    <div id="cashier-cart" class="cart-list"></div>

    <!-- 总计 -->
    <div class="cashier-total-bar" id="cashier-total-bar">
      <div class="ct-left">
        <div class="ct-items" id="ct-items">0 件商品</div>
        <div class="ct-total" id="ct-total">¥0.00</div>
      </div>
      <button class="ct-btn" id="ct-btn" onclick="Accounting._submitSale()">出售</button>
    </div>

    <!-- 成功提示 -->
    <div id="cashier-success" class="sale-success hidden">
      <div class="ss-icon">🎉</div>
      <div class="ss-text">出售成功！</div>
      <div class="ss-sub" id="ss-sub"></div>
    </div>
  </div>
`;

// 绑定搜索
const inp = container.querySelector('#cashier-search');
const dd  = container.querySelector('#cashier-dropdown');

inp.addEventListener('input', () => {
  const q = inp.value.trim().toLowerCase();
  const inv = Engine.getInventory().filter(p => parseFloat(p.qty) > 0);
  if (!q) { dd.classList.add('hidden'); return; }
  const results = inv.filter(p => p.name.toLowerCase().includes(q));
  if (!results.length) {
    dd.innerHTML = '<div class="dd-empty">没有找到商品</div>';
  } else {
    dd.innerHTML = results.map(p => `
      <div class="dd-item" data-id="${p.id}">
        <span class="dd-name">${p.name}</span>
        <span class="dd-info">库存${p.qty}件 · ${Engine.fmtMoney(p.salePrice)}</span>
      </div>
    `).join('');
    dd.querySelectorAll('.dd-item').forEach(el => {
      el.onclick = () => {
        const prod = inv.find(p => p.id == el.dataset.id);
        if (prod) addToCart(prod);
        inp.value = '';
        dd.classList.add('hidden');
      };
    });
  }
  dd.classList.remove('hidden');
});

// 点击外部关闭
document.addEventListener('click', e => {
  if (!container.querySelector('.search-wrap').contains(e.target)) {
    dd.classList.add('hidden');
  }
}, { once: false });

function addToCart(prod) {
  const existing = cart.find(c => c.productId === prod.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + 1, parseFloat(prod.qty));
  } else {
    cart.push({
      productId: prod.id,
      name:      prod.name,
      qty:       1,
      costPrice: parseFloat(prod.costPrice),
      salePrice: parseFloat(prod.salePrice),
      maxQty:    parseFloat(prod.qty),
    });
  }
  renderCart();
}

function renderCart() {
  const el = container.querySelector('#cashier-cart');
  if (!cart.length) {
    el.innerHTML = '<div class="cart-empty">点击搜索添加商品 🛍️</div>';
  } else {
    el.innerHTML = cart.map((item, i) => `
      <div class="cart-item" data-i="${i}">
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
      </div>
    `).join('');
  }
  updateTotal();
}

function updateTotal() {
  const total = cart.reduce((a, c) => a + c.salePrice * c.qty, 0);
  const count = cart.reduce((a, c) => a + c.qty, 0);
  container.querySelector('#ct-items').textContent = count + ' 件商品';
  container.querySelector('#ct-total').textContent = Engine.fmtMoney(total);
  container.querySelector('#ct-btn').disabled = cart.length === 0;
}

// 暴露给内联事件
Accounting._cartQty = (i, d) => {
  cart[i].qty = Math.max(1, Math.min(cart[i].qty + d, cart[i].maxQty));
  renderCart();
};
Accounting._cartDel = (i) => {
  cart.splice(i, 1);
  renderCart();
};
Accounting._submitSale = () => {
  if (!cart.length) return;
  const record = Engine.recordSale(cart);
  cart = [];
  renderCart();
  // 成功动画
  const su = container.querySelector('#cashier-success');
  container.querySelector('#ss-sub').textContent =
    '共收 ' + Engine.fmtMoney(record.total) + ' · 毛利 ' + Engine.fmtMoney(record.profit);
  su.classList.remove('hidden');
  su.style.animation = 'none';
  requestAnimationFrame(() => { su.style.animation = ''; });
  setTimeout(() => su.classList.add('hidden'), 3000);
  // 通知库存看板刷新
  if (window.Dashboard && window.Dashboard.refresh) window.Dashboard.refresh();
};

renderCart();
```

}

// ════════════════════════════════════════════════════════════════════════
//  库存录入（人工盘点 / 初始录入）
// ════════════════════════════════════════════════════════════════════════
function renderEntry(container) {
_renderForm(container, ‘entry’, ‘库存录入’, ‘➕’, ‘将现有商品录入库存系统’);
}

// ════════════════════════════════════════════════════════════════════════
//  进货
// ════════════════════════════════════════════════════════════════════════
function renderRestock(container) {
_renderForm(container, ‘restock’, ‘进货’, ‘📦’, ‘记录新到货商品，自动补充库存’);
}

function _renderForm(container, source, title, icon, subtitle) {
const CATS = [‘食品饮料’, ‘日用百货’, ‘休闲零食’, ‘冷冻冷藏’, ‘酒水’, ‘烟草’, ‘其他’];

```
container.innerHTML = `
  <div class="page-form">
    <div class="page-title-bar">
      <span class="page-title-icon">${icon}</span>
      <span class="page-title-text">${title}</span>
    </div>
    <div class="form-subtitle">${subtitle}</div>

    <div class="form-card">
      <div class="form-group">
        <label class="form-lbl">商品名称 *</label>
        <input id="f-name" class="form-inp" type="text" placeholder="例：农夫山泉 550ml">
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
      <!-- 毛利预览 -->
      <div class="margin-preview" id="margin-preview" style="display:none">
        <span class="mp-label">毛利预览</span>
        <span class="mp-unit" id="mp-unit">单件毛利 ¥—</span>
        <span class="mp-rate" id="mp-rate">毛利率 —%</span>
      </div>
    </div>

    <button class="form-submit" id="f-submit" onclick="Accounting._submitForm('${source}')">
      <span>${icon}</span> 确认${title}
    </button>

    <div class="form-success hidden" id="f-success">✅ ${title}成功！</div>

    <!-- 历史记录 -->
    <div class="section-label" style="margin-top:24px">${title}历史</div>
    <div id="form-history" class="form-history-list"></div>
  </div>
`;

// 分类选择
container.querySelectorAll('.cat-chip').forEach(btn => {
  btn.onclick = () => {
    container.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

// 实时毛利预览
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

// 暴露提交
Accounting._submitForm = (src) => {
  const name     = container.querySelector('#f-name').value.trim();
  const cost     = parseFloat(container.querySelector('#f-cost').value);
  const sale     = parseFloat(container.querySelector('#f-sale').value);
  const qty      = parseFloat(container.querySelector('#f-qty').value);
  const expDate  = container.querySelector('#f-exp').value;
  const cat      = container.querySelector('.cat-chip.active')?.dataset.cat || '其他';

  if (!name)           return _shake(container.querySelector('#f-name'), '请填写商品名称');
  if (isNaN(cost)||cost<0) return _shake(container.querySelector('#f-cost'), '请填写有效进价');
  if (isNaN(sale)||sale<0) return _shake(container.querySelector('#f-sale'), '请填写有效售价');
  if (isNaN(qty)||qty<1)   return _shake(container.querySelector('#f-qty'),  '数量至少为1');

  Engine.addProduct({ name, category: cat, qty, costPrice: cost, salePrice: sale, expireDate: expDate, source: src, createdAt: new Date().toISOString() });

  // 清空
  ['f-name','f-cost','f-sale','f-qty','f-exp'].forEach(id => {
    container.querySelector('#' + id).value = '';
  });
  container.querySelector('#margin-preview').style.display = 'none';

  // 成功提示
  const su = container.querySelector('#f-success');
  su.classList.remove('hidden');
  setTimeout(() => su.classList.add('hidden'), 2000);

  renderHistory();
  if (window.Dashboard && window.Dashboard.refresh) window.Dashboard.refresh();
};

function renderHistory() {
  const el  = container.querySelector('#form-history');
  const inv = Engine.getInventory().filter(p => p.source === source).slice(-10).reverse();
  if (!inv.length) {
    el.innerHTML = '<div class="hist-empty">暂无记录</div>';
    return;
  }
  el.innerHTML = inv.map(p => `
    <div class="hist-item">
      <div class="hi-left">
        <div class="hi-name">${p.name}</div>
        <div class="hi-meta">${p.category} · 进价${Engine.fmtMoney(p.costPrice)} · 售价${Engine.fmtMoney(p.salePrice)}</div>
      </div>
      <div class="hi-right">
        <div class="hi-qty">×${p.qty}</div>
        ${p.expireDate ? `<div class="hi-exp">到期${Engine.fmtDate(p.expireDate)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

renderHistory();
```

}

function _shake(el, msg) {
el.style.borderColor = ‘#F44336’;
el.placeholder = msg;
el.classList.add(‘shake’);
setTimeout(() => { el.classList.remove(‘shake’); el.style.borderColor = ‘’; }, 600);
}

return { renderCashier, renderEntry, renderRestock };
})();

window.Accounting = Accounting;
