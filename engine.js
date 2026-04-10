// ── 獭掌柜 · 核心数据引擎 engine.js ──────────────────────────────────────
// 所有 localStorage 读写、业务逻辑计算均在此处理

const Engine = (function () {

// ── Key 定义 ──────────────────────────────────────────────────────────
const KEYS = {
history:   ‘otter_history’,     // 日历收支历史
inventory: ‘otter_inventory’,   // 库存商品列表
sales:     ‘otter_sales’,       // 销售流水记录
restock:   ‘otter_restock’,     // 进货流水记录
};

// ── 基础读写 ──────────────────────────────────────────────────────────
function load(key) {
try { return JSON.parse(localStorage.getItem(key)) || null; }
catch (e) { return null; }
}
function save(key, val) {
localStorage.setItem(key, JSON.stringify(val));
}

// ── 日历历史 ──────────────────────────────────────────────────────────
function getHistory()          { return load(KEYS.history) || {}; }
function saveHistory(h)        { save(KEYS.history, h); }
function getDay(dateKey)       { return getHistory()[dateKey] || null; }
function setDay(dateKey, data) {
const h = getHistory();
h[dateKey] = Object.assign(h[dateKey] || {}, data);
saveHistory(h);
}

// ── 库存 ──────────────────────────────────────────────────────────────
// 商品结构：
// { id, name, category, qty, costPrice, salePrice, expireDate, source, createdAt }
// source: ‘entry’(库存录入) | ‘restock’(进货)

function getInventory()    { return load(KEYS.inventory) || []; }
function saveInventory(v)  { save(KEYS.inventory, v); }

function addProduct(product) {
const inv = getInventory();
// 若同名同进价商品已存在，则累加数量
const existing = inv.find(p =>
p.name === product.name &&
parseFloat(p.costPrice) === parseFloat(product.costPrice) &&
p.category === product.category
);
if (existing) {
existing.qty = (parseFloat(existing.qty) || 0) + (parseFloat(product.qty) || 0);
existing.salePrice  = product.salePrice  || existing.salePrice;
existing.expireDate = product.expireDate || existing.expireDate;
} else {
inv.push(Object.assign({ id: Date.now() + Math.random() }, product));
}
saveInventory(inv);
return inv;
}

function updateProductQty(productId, deltaQty) {
// deltaQty < 0 表示减少（售出），> 0 表示增加（进货）
const inv = getInventory();
const p   = inv.find(p => p.id == productId);
if (!p) return false;
p.qty = Math.max(0, (parseFloat(p.qty) || 0) + deltaQty);
saveInventory(inv);
return true;
}

function deleteProduct(productId) {
const inv = getInventory().filter(p => p.id != productId);
saveInventory(inv);
}

// ── 销售流水 ──────────────────────────────────────────────────────────
// 每条记录：{ id, date, items:[{productId,name,qty,costPrice,salePrice}], total, profit, createdAt }

function getSales()    { return load(KEYS.sales) || []; }
function saveSales(v)  { save(KEYS.sales, v); }

function recordSale(items) {
// items: [{ productId, name, qty, costPrice, salePrice }]
const dateKey = new Date().toLocaleDateString();
let total = 0, cost = 0;
items.forEach(item => {
total += parseFloat(item.salePrice) * parseFloat(item.qty);
cost  += parseFloat(item.costPrice) * parseFloat(item.qty);
});
const profit = total - cost;
const record = {
id:        Date.now(),
date:      dateKey,
items,
total,
profit,
createdAt: new Date().toISOString(),
};
const sales = getSales();
sales.push(record);
saveSales(sales);

```
// 扣减库存
items.forEach(item => {
  updateProductQty(item.productId, -parseFloat(item.qty));
});

// 更新日历历史
updateDayFromSales(dateKey);

return record;
```

}

function updateDayFromSales(dateKey) {
const sales = getSales().filter(s => s.date === dateKey);
const revenue = sales.reduce((a, s) => a + s.total, 0);
const profit  = sales.reduce((a, s) => a + s.profit, 0);
const gm      = revenue > 0 ? Math.round(profit / revenue * 100) : 0;
setDay(dateKey, { revenue, profit, grossMargin: gm, variableCost: revenue - profit });
}

// ── 销量排行 ──────────────────────────────────────────────────────────
// 返回 [{name, totalQty, totalRevenue}]
function getSalesRanking() {
const sales = getSales();
const map = {};
sales.forEach(s => {
s.items.forEach(item => {
if (!map[item.name]) map[item.name] = { name: item.name, totalQty: 0, totalRevenue: 0, totalProfit: 0 };
map[item.name].totalQty     += parseFloat(item.qty);
map[item.name].totalRevenue += parseFloat(item.salePrice) * parseFloat(item.qty);
map[item.name].totalProfit  += (parseFloat(item.salePrice) - parseFloat(item.costPrice)) * parseFloat(item.qty);
});
});
return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
}

// ── 毛利排行 ──────────────────────────────────────────────────────────
// 已售毛利排行：售价*售出数量 - 进价*售出数量，按商品聚合
function getSoldProfitRanking() {
const sales = getSales();
const map = {};
sales.forEach(s => {
s.items.forEach(item => {
if (!map[item.name]) map[item.name] = { name: item.name, profit: 0, qty: 0 };
map[item.name].profit += (parseFloat(item.salePrice) - parseFloat(item.costPrice)) * parseFloat(item.qty);
map[item.name].qty    += parseFloat(item.qty);
});
});
return Object.values(map).sort((a, b) => b.profit - a.profit);
}

// 单品毛利排行：所有库存商品，不论是否售出，单件毛利 = 售价 - 进价
function getUnitProfitRanking() {
return getInventory()
.map(p => ({
name:       p.name,
category:   p.category,
unitProfit: parseFloat(p.salePrice) - parseFloat(p.costPrice),
margin:     parseFloat(p.costPrice) > 0
? Math.round((parseFloat(p.salePrice) - parseFloat(p.costPrice)) / parseFloat(p.salePrice) * 100)
: 0,
salePrice:  p.salePrice,
costPrice:  p.costPrice,
}))
.sort((a, b) => b.unitProfit - a.unitProfit);
}

// ── 临期货品 ──────────────────────────────────────────────────────────
// 返回 N 天内到期的商品，按到期日升序
function getExpiringProducts(days = 7) {
const now     = new Date();
const cutoff  = new Date(now.getTime() + days * 86400000);
return getInventory()
.filter(p => {
if (!p.expireDate) return false;
const exp = new Date(p.expireDate);
return exp <= cutoff;
})
.sort((a, b) => new Date(a.expireDate) - new Date(b.expireDate));
}

// ── 工具 ──────────────────────────────────────────────────────────────
function fmtMoney(v) {
v = parseFloat(v) || 0;
return v >= 10000 ? ‘¥’ + (v / 10000).toFixed(1) + ‘w’ : ‘¥’ + v.toFixed(2).replace(/.00$/, ‘’);
}
function fmtDate(iso) {
if (!iso) return ‘—’;
const d = new Date(iso);
return (d.getMonth() + 1) + ‘/’ + d.getDate();
}
function daysUntil(dateStr) {
if (!dateStr) return null;
const diff = new Date(dateStr) - new Date();
return Math.ceil(diff / 86400000);
}

// ── 月度统计 ──────────────────────────────────────────────────────────
function getMonthStats(year, month) {
const h = getHistory();
let revenue = 0, profit = 0, days = 0;
Object.keys(h).forEach(k => {
const d = new Date(k);
if (d.getFullYear() === year && d.getMonth() === month) {
revenue += parseFloat(h[k].revenue) || 0;
profit  += parseFloat(h[k].profit)  || 0;
if ((parseFloat(h[k].revenue) || 0) > 0) days++;
}
});
return { revenue, profit, days, gm: revenue > 0 ? Math.round(profit / revenue * 100) : 0 };
}

function getStreak() {
const h = getHistory();
const now = new Date();
let s = 0;
for (let i = 0; i < 365; i++) {
const d = new Date(now); d.setDate(d.getDate() - i);
const k = d.toLocaleDateString();
if (h[k] && parseFloat(h[k].revenue) > 0) s++;
else if (i > 0) break;
}
return s;
}

// ── 公开 API ──────────────────────────────────────────────────────────
return {
getHistory, setDay, getDay,
getInventory, addProduct, updateProductQty, deleteProduct,
getSales, recordSale,
getSalesRanking, getSoldProfitRanking, getUnitProfitRanking,
getExpiringProducts,
getMonthStats, getStreak,
fmtMoney, fmtDate, daysUntil,
KEYS,
};
})();

// 挂载到全局
window.Engine = Engine;
