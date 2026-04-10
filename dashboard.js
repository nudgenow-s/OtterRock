// ── 獭掌柜 · 看板模块 dashboard.js ──────────────────────────────────────
// 依赖 engine.js (window.Engine)

const Dashboard = (function () {

// ════════════════════════════════════════════════════════════════════════
//  库存看板
// ════════════════════════════════════════════════════════════════════════
let _inventoryContainer = null;

function renderInventory(container) {
_inventoryContainer = container;
_drawInventory(container);
}

function _drawInventory(container) {
const inv = Engine.getInventory();
const CATS = […new Set(inv.map(p => p.category || ‘其他’))].sort();

```
container.innerHTML = `
  <div class="page-dashboard">
    <div class="page-title-bar">
      <span class="page-title-icon">📦</span>
      <span class="page-title-text">库存看板</span>
      <span class="inv-total-chip">${inv.length} 种商品</span>
    </div>

    <!-- 汇总卡片 -->
    <div class="inv-summary-row">
      <div class="inv-sc">
        <div class="inv-sc-val">${inv.reduce((a,p)=>a+(parseFloat(p.qty)||0),0)}</div>
        <div class="inv-sc-lbl">总库存件数</div>
      </div>
      <div class="inv-sc">
        <div class="inv-sc-val">${Engine.fmtMoney(inv.reduce((a,p)=>a+(parseFloat(p.costPrice)||0)*(parseFloat(p.qty)||0),0))}</div>
        <div class="inv-sc-lbl">库存进价总值</div>
      </div>
      <div class="inv-sc">
        <div class="inv-sc-val">${Engine.fmtMoney(inv.reduce((a,p)=>a+(parseFloat(p.salePrice)||0)*(parseFloat(p.qty)||0),0))}</div>
        <div class="inv-sc-lbl">库存售价总值</div>
      </div>
    </div>

    <!-- 搜索 -->
    <div class="inv-search-wrap">
      <span class="search-ico">🔍</span>
      <input id="inv-search" class="search-inp" type="text" placeholder="搜索商品名称…">
    </div>

    ${!inv.length ? '<div class="inv-empty">暂无库存商品<br>请先在「库存录入」或「进货」中添加</div>' : ''}

    <!-- 分类表格 -->
    <div id="inv-tables"></div>
  </div>
`;

let filterQ = '';
const searchEl = container.querySelector('#inv-search');
if (searchEl) {
  searchEl.addEventListener('input', () => {
    filterQ = searchEl.value.trim().toLowerCase();
    renderTables();
  });
}

function renderTables() {
  const tbContainer = container.querySelector('#inv-tables');
  if (!tbContainer) return;
  const filtered = filterQ
    ? inv.filter(p => p.name.toLowerCase().includes(filterQ))
    : inv;

  if (!filtered.length) {
    tbContainer.innerHTML = '<div class="inv-empty">没有匹配的商品</div>';
    return;
  }

  const grouped = {};
  filtered.forEach(p => {
    const cat = p.category || '其他';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  tbContainer.innerHTML = Object.keys(grouped).sort().map(cat => {
    const items = grouped[cat];
    const rows  = items.map(p => {
      const daysLeft = Engine.daysUntil(p.expireDate);
      const expClass = daysLeft !== null && daysLeft <= 3 ? 'exp-danger'
                     : daysLeft !== null && daysLeft <= 7 ? 'exp-warn' : '';
      const qtyClass = parseFloat(p.qty) === 0 ? 'qty-zero'
                     : parseFloat(p.qty) <= 5  ? 'qty-low' : '';
      return `
        <tr class="inv-row" data-id="${p.id}">
          <td class="inv-td td-name">${p.name}</td>
          <td class="inv-td td-qty ${qtyClass}">${p.qty}</td>
          <td class="inv-td td-cost">${Engine.fmtMoney(p.costPrice)}</td>
          <td class="inv-td td-sale">${Engine.fmtMoney(p.salePrice)}</td>
          <td class="inv-td td-exp ${expClass}">
            ${p.expireDate
              ? (daysLeft < 0 ? '<span class="expired-badge">已过期</span>'
                 : daysLeft === 0 ? '<span class="exp-today">今天到期</span>'
                 : Engine.fmtDate(p.expireDate) + ' (' + daysLeft + 'd)')
              : '—'}
          </td>
          <td class="inv-td td-act">
            <button class="inv-del-btn" onclick="Dashboard._deleteProduct(${p.id})">🗑</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="inv-cat-section">
        <div class="inv-cat-header">
          <span class="inv-cat-name">${cat}</span>
          <span class="inv-cat-count">${items.length} 种</span>
        </div>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th class="inv-th">商品名称</th>
                <th class="inv-th">数量</th>
                <th class="inv-th">进价</th>
                <th class="inv-th">售价</th>
                <th class="inv-th">过期日</th>
                <th class="inv-th"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

renderTables();

// 删除按钮
Dashboard._deleteProduct = (id) => {
  if (!confirm('确定删除此商品？')) return;
  Engine.deleteProduct(id);
  _drawInventory(container);
};
```

}

// 供外部刷新
function refresh() {
if (_inventoryContainer) _drawInventory(_inventoryContainer);
}

// ════════════════════════════════════════════════════════════════════════
//  临期货品
// ════════════════════════════════════════════════════════════════════════
function renderExpiring(container) {
container.innerHTML = `
<div class="page-expiring">
<div class="page-title-bar">
<span class="page-title-icon">⏰</span>
<span class="page-title-text">临期货品</span>
</div>

```
    <!-- 天数筛选 -->
    <div class="exp-filter-row">
      <button class="exp-filter-btn active" data-days="7">7天内</button>
      <button class="exp-filter-btn" data-days="14">14天内</button>
      <button class="exp-filter-btn" data-days="30">30天内</button>
      <button class="exp-filter-btn" data-days="0">已过期</button>
    </div>

    <div id="exp-content"></div>
  </div>
`;

let activeDays = 7;
container.querySelectorAll('.exp-filter-btn').forEach(btn => {
  btn.onclick = () => {
    container.querySelectorAll('.exp-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeDays = parseInt(btn.dataset.days);
    renderExpContent();
  };
});

function renderExpContent() {
  const el = container.querySelector('#exp-content');
  let items;
  if (activeDays === 0) {
    // 已过期
    items = Engine.getInventory().filter(p => {
      if (!p.expireDate) return false;
      return Engine.daysUntil(p.expireDate) < 0;
    }).sort((a, b) => new Date(a.expireDate) - new Date(b.expireDate));
  } else {
    items = Engine.getExpiringProducts(activeDays);
  }

  if (!items.length) {
    el.innerHTML = `<div class="exp-empty">
      <div class="exp-empty-icon">✨</div>
      <div>暂无${activeDays === 0 ? '过期' : activeDays + '天内临期'}商品</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div class="exp-summary">共 <b>${items.length}</b> 种商品需要关注</div>
    ${items.map(p => {
      const d = Engine.daysUntil(p.expireDate);
      const urgency = d < 0 ? 'exp-card-danger'
                    : d === 0 ? 'exp-card-danger'
                    : d <= 3  ? 'exp-card-warn'
                    : 'exp-card-ok';
      const badge = d < 0  ? `已过期 ${Math.abs(d)} 天`
                  : d === 0 ? '今天到期'
                  : `还剩 ${d} 天`;
      return `
        <div class="exp-card ${urgency}">
          <div class="exp-card-left">
            <div class="exp-card-name">${p.name}</div>
            <div class="exp-card-meta">${p.category || '其他'} · 库存 ${p.qty} 件</div>
            <div class="exp-card-price">进价 ${Engine.fmtMoney(p.costPrice)} · 售价 ${Engine.fmtMoney(p.salePrice)}</div>
          </div>
          <div class="exp-card-right">
            <div class="exp-badge ${urgency}">${badge}</div>
            <div class="exp-date">${p.expireDate}</div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

renderExpContent();
```

}

// ════════════════════════════════════════════════════════════════════════
//  销量排行（游戏化）
// ════════════════════════════════════════════════════════════════════════
function renderSalesRanking(container) {
const data = Engine.getSalesRanking();
_renderRanking(container, {
title: ‘销量排行’,
icon:  ‘📊’,
subtitle: ‘统计开业以来累计售出数量’,
data,
valueKey:  ‘totalQty’,
valueUnit: ‘件’,
valueFmt:  v => v + ’ 件’,
subFmt:    item => ‘营收 ’ + Engine.fmtMoney(item.totalRevenue),
emptyMsg:  ‘还没有销售记录，快去收银吧！’,
medalColors: [’#FFD700’,’#C0C0C0’,’#CD7F32’],
});
}

// ════════════════════════════════════════════════════════════════════════
//  毛利排行（游戏化）
// ════════════════════════════════════════════════════════════════════════
function renderProfitRanking(container) {
container.innerHTML = `
<div class="page-ranking">
<div class="page-title-bar">
<span class="page-title-icon">💹</span>
<span class="page-title-text">毛利排行</span>
</div>

```
    <!-- 双榜切换 -->
    <div class="rank-tab-row">
      <button class="rank-tab active" id="rtab-sold" onclick="Dashboard._switchRankTab('sold')">已售毛利榜</button>
      <button class="rank-tab" id="rtab-unit" onclick="Dashboard._switchRankTab('unit')">单品毛利榜</button>
    </div>

    <div id="rank-panel-sold"></div>
    <div id="rank-panel-unit" style="display:none"></div>
  </div>
`;

Dashboard._switchRankTab = (tab) => {
  ['sold','unit'].forEach(t => {
    container.querySelector('#rtab-' + t).classList.toggle('active', t === tab);
    container.querySelector('#rank-panel-' + t).style.display = t === tab ? '' : 'none';
  });
};

// 已售毛利榜
const soldData = Engine.getSoldProfitRanking();
const maxSold  = soldData.length ? soldData[0].profit : 1;
container.querySelector('#rank-panel-sold').innerHTML = soldData.length ? `
  <div class="rank-subtitle">售价×售出量 − 进价×售出量，贡献总毛利</div>
  ${soldData.map((item, i) => _rankCard(item, i, item.profit, maxSold, Engine.fmtMoney(item.profit), `已售 ${item.qty} 件`)).join('')}
` : '<div class="rank-empty">暂无销售数据</div>';

// 单品毛利榜
const unitData = Engine.getUnitProfitRanking();
const maxUnit  = unitData.length ? unitData[0].unitProfit : 1;
container.querySelector('#rank-panel-unit').innerHTML = unitData.length ? `
  <div class="rank-subtitle">所有商品单件毛利（售价 − 进价），不论是否售出</div>
  ${unitData.map((item, i) => _rankCard(item, i, item.unitProfit, maxUnit, Engine.fmtMoney(item.unitProfit) + '/件', `毛利率 ${item.margin}%`)).join('')}
` : '<div class="rank-empty">请先录入商品</div>';
```

}

// ── 通用排行渲染 ───────────────────────────────────────────────────────
function _renderRanking(container, opts) {
const { title, icon, subtitle, data, valueFmt, subFmt, emptyMsg, medalColors } = opts;
const max = data.length ? data[0][opts.valueKey] : 1;

```
container.innerHTML = `
  <div class="page-ranking">
    <div class="page-title-bar">
      <span class="page-title-icon">${icon}</span>
      <span class="page-title-text">${title}</span>
    </div>
    <div class="rank-subtitle">${subtitle}</div>
    ${!data.length
      ? `<div class="rank-empty">${emptyMsg}</div>`
      : data.map((item, i) => _rankCard(item, i, item[opts.valueKey], max, valueFmt(item[opts.valueKey]), subFmt(item))).join('')
    }
  </div>
`;
```

}

function _rankCard(item, i, val, max, valLabel, subLabel) {
const medals   = [‘🥇’,‘🥈’,‘🥉’];
const barColors= [’#FF6B35’,’#FF9900’,’#4CAF50’,’#2196F3’,’#9C27B0’];
const pct      = max > 0 ? Math.max(4, Math.round(val / max * 100)) : 4;
const medal    = i < 3 ? medals[i] : `<span class="rank-num">${i+1}</span>`;
const barColor = barColors[Math.min(i, barColors.length - 1)];

```
return `
  <div class="rank-card ${i < 3 ? 'rank-top-' + (i+1) : ''}">
    <div class="rc-medal">${medal}</div>
    <div class="rc-body">
      <div class="rc-name">${item.name}</div>
      <div class="rc-bar-wrap">
        <div class="rc-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="rc-sub">${subLabel}</div>
    </div>
    <div class="rc-val">${valLabel}</div>
  </div>
`;
```

}

return { renderInventory, renderExpiring, renderSalesRanking, renderProfitRanking, refresh };
})();

window.Dashboard = Dashboard;
