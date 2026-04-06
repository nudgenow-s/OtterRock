const Store = {
    // 库存档案
    getInv: () => JSON.parse(localStorage.getItem('otter_inv')) || {
        "6901234567890": { name: "示例商品", price: 10, cost: 5, stock: 100 }
    },
    // 营业历史
    getHis: () => JSON.parse(localStorage.getItem('otter_his')) || {},
    save: (inv, his) => {
        if(inv) localStorage.setItem('otter_inv', JSON.stringify(inv));
        if(his) localStorage.setItem('otter_his', JSON.stringify(his));
    }
};
