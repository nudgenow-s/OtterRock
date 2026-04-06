const Engine = {
    // 进货/建档
    stockIn: (pid, name, qty, cost, price) => {
        const inv = Store.getInv();
        if(!inv[pid]) inv[pid] = { name: name, stock: 0 };
        inv[pid].name = name || inv[pid].name;
        inv[pid].stock += qty;
        inv[pid].cost = cost; 
        inv[pid].price = price;
        Store.save(inv);
    },
    // 销售出库
    sell: (dateKey, pid, qty) => {
        const inv = Store.getInv();
        const his = Store.getHis();
        const item = inv[pid];
        
        if(!item || item.stock < qty) return { success: false, msg: "库存不足" };

        const rev = item.price * qty;
        const cost = item.cost * qty;
        const profit = rev - cost;

        if(!his[dateKey]) his[dateKey] = { revenue:0, profit:0, variableCost:0, sales:[] };
        
        his[dateKey].revenue += rev;
        his[dateKey].variableCost += cost;
        his[dateKey].profit = his[dateKey].revenue - his[dateKey].variableCost;
        // 计算毛利率
        his[dateKey].grossMargin = ((his[dateKey].profit / his[dateKey].revenue) * 100).toFixed(1);
        
        his[dateKey].sales.push({ pid, name: item.name, qty, rev, time: new Date().toLocaleTimeString() });
        
        inv[pid].stock -= qty; // 扣减库存
        Store.save(inv, his);
        return { success: true, rev };
    }
};
