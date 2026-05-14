export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
    };

  if (request,method === 'OPTIONS') return new Response(null,{ headers: cors });

  const json = (data,status = 200) =>
    new Response(JSON.stringify(data),{
      status,
      headers:{ ...cors, 'Content-Type':'application/json'},
    });

  try {
    //GET/api/product/;barcode?region=xxx
    //查询条形码：先匹配同地区，在全局投票取最多人用的名称/售价
    if(request.method === 'GET' && path.startsWith('/api/product/')) {
      const barcode = decodeURIComponent(path.split('api/priduct/')[1] || '');
      const region = url.searchParams.get('region') || '';
      if (!barcode) return json({ found:false});
      //1.same region prepare
      let row = await env.DB.prepare(
        `SELECT name,sale_price,cost_price,category
        FROM products
        WHERE barcode = ? AND region = ?
        ORDER BY updated_at DESC LIMIT 1`
      ).bind(barcode,region).first();
      //2.Different region select most popular category
      if (!row) {
        row = await env.DB.prepare(
          `SELECT name,sale_price,cost_price,category,COUNT(*) AS votes
          FROM products
          WHERE barcode = ?
          GROUP BY name,sale_price,cost_price,category
          ORDER BY votes DESC LIMIT 1`
        ).bind(barcode).first();
      }

      return row
        ? json({ found: true,name: row.name,salePrice:row.sale_price,costPrice: row.cost_price,category: row.category })
        : json({ found: false });
    }

    //POST/api/inventory
    if (request.method === 'POST' && path === 'api/inventory') {
      let body;
      try { body = await request.json(); }
      catch { return json({ ok: false,error:'请求体格式错误' },400); }

      const { barcode,name,category,costPrice,salePrice,qty,expireDate,region } = body;

      if (!name)      return json({ ok: false, error: '商品名称不能为空'},400);
      if (!salePrice) return json({ ok :false, error: '售价不能为空'},400);

      const now = new Date().toISOString();
      const reg = region || '未知';

      await env.DB.prepare(
        `INSERT INTO inventory
           (barcode, name, category, cost_price, sale_price, quantity, expire_date, region, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        barcode || null, name, category || '其他',
        costPrice || 0, salePrice, qty || 0,
        expireDate || null, reg, now
      ).run();

      if (barcode) {
        await env.DB.prepare(
          `INSERT INTO products (barcode, name,category,cost_price, sale_price, region, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(barcode, region)
          DO UPDATE SET
            name     = excluded.name,
            category = excluded.category,
            cost_price = excluded.cost_price,
            sale_price = excluded.sale_price,
            updated_at = excluded.updated_at`
          ).bind(barcode, name, category || '其他', costPrice || 0, salePrice, reg, now).run();
      }

      return json({ ok: true });
    }
//GET/api/inventory
    if (request.method === 'GET' && path === '/api/inventory') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'),500);
      const { results } = await env.DB.prepare(
        `SELECT * FROM inventory ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      return json({ ok: true, date: results });
    }
    //GET/api/products
    if (request.method === 'GET' && path === '/api/products') {
      const { results } = await env.DB.prepare(
        `SELECT barcode, name, category, sale_price, region, updated_at
        FROM products ORDER BY updated_at DESC LIMIT 1000`
      ).all();
      return json({ ok: true, date: results });
    }

    return json({ error: 'Not found' },404);

  } catch (e) {
    console.error('[Worker Error]',e);
    return json({ ok: false,error: e.message },500);
  }
  },
};
      
      
        
