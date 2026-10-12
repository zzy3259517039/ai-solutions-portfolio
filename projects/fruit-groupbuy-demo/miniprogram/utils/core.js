/* 两个界面共用的演示逻辑。浏览器和微信各自使用本地存储，不共享数据。
 * 这里故意没有真实身份、支付和云端核销；正式版必须迁移到可信服务端。
 * 金额以分存储；下单保存商品快照；相同请求标识重复提交只创建一个订单。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FruitDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'neighbor-fruit-demo-v1';
  const STORE = { name:'邻里果铺', area:'武汉 · 石桥花园周边', address:'虚拟演示门店，非实际提货地址', hours:'演示营业时间 09:00—21:00' };
  const CATALOG = [
    { id:'family', name:'一袋装下，全家的喜欢', shortName:'家庭分享水果袋', subtitle:'苹果 + 橙子 + 香蕉 · 固定组合', price:2990, tag:'家庭分享', category:'组合装', stock:20, art:'family', color:'#eee7d5', items:['苹果 2 个（合计不低于 400g）','橙子 2 个（合计不低于 400g）','香蕉 1 份（不低于 500g）'], description:'一份组合，照顾家里不同的口味。演示套餐规格固定，到店直接提走。' },
    { id:'orange', name:'把阳光，带回家', shortName:'阳光鲜橙分享装', subtitle:'鲜橙 1.5kg · 整果固定重量装', price:1990, tag:'日常鲜果', category:'单品装', stock:30, art:'orange', color:'#f8e8c9', items:['鲜橙 1 袋，净重不低于 1.5kg','整果交付，不含切配服务'], description:'日常补充一份清甜。按固定重量成袋交付，演示中不涉及散称补差价。' },
    { id:'apple', name:'清脆一口，好心情', shortName:'脆甜苹果分享装', subtitle:'苹果 1kg · 整果固定重量装', price:2290, tag:'轻享推荐', category:'单品装', stock:15, art:'apple', color:'#f1dfd7', items:['苹果 1 袋，净重不低于 1kg','整果交付，不含配送'], description:'装好一袋日常的小确幸。演示图片为插画，价格和库存均为测试数据。' }
  ];
  function money(cents) { return (cents / 100).toFixed(2); }
  function date(time) { const d = new Date(time); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  function fail(message) { throw new Error(message); }
  function fresh() { return { version:1, sequence:0, inventory:CATALOG.reduce((a,p)=>(a[p.id]=p.stock,a),{}), orders:[], ledger:[] }; }
  function create(storage, clock) {
    const now = clock || (() => Date.now());
    function read() {
      const raw = storage.get(KEY);
      if (!raw) return fresh();
      try { const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (value.version === 1 && Array.isArray(value.orders) && value.inventory && Array.isArray(value.ledger)) return value;
      } catch (_) {}
      return fail('演示数据无法读取，请在演示说明中重置测试数据。');
    }
    function save(s) { storage.set(KEY, JSON.stringify(s)); }
    function status(o) { return o.status === 'unused' && now() >= o.expiresAt ? 'expired' : o.status; }
    function decorate(o) {
      const s = status(o);
      return Object.assign({}, o, { status:s, statusLabel:({unused:'待提货',redeemed:'已提货',refunded:'已模拟退款',expired:'已过期'})[s], priceText:money(o.price), createdText:date(o.createdAt), expiryText:date(o.expiresAt), codeText:o.code.slice(0,4)+' '+o.code.slice(4), canRedeem:s==='unused', canRefund:s==='unused' });
    }
    function products() { const s = read(); return CATALOG.map(p=>Object.assign({},p,{ stock:s.inventory[p.id], priceText:money(p.price) })); }
    function product(id) { return products().find(p=>p.id===id) || fail('套餐不存在。'); }
    function orders() { return read().orders.slice().reverse().map(decorate); }
    function order(id) { const o = read().orders.find(x=>x.id===id); return o ? decorate(o) : fail('找不到这笔测试订单。'); }
    function purchase(productId, requestId) {
      if (!requestId || typeof requestId !== 'string') fail('缺少请求标识，请重新打开购买页。');
      const s = read();
      const previous = s.orders.find(o=>o.requestId===requestId);
      if (previous) {
        if (previous.productId !== productId) fail('请求标识与套餐不一致。');
        return decorate(previous);
      }
      const p = CATALOG.find(x=>x.id===productId);
      if (!p) fail('套餐不存在。');
      if (!(s.inventory[p.id] > 0)) fail('这份套餐已售罄，请选择其他套餐。');
      const sequence = s.sequence + 1;
      let code;
      for (let i=0; i<100; i++) {
        code = String(10000000 + Math.floor(Math.random()*90000000));
        if (!s.orders.some(o=>o.code===code)) break;
        code = null;
      }
      if (!code) fail('测试码生成失败，请重试。');
      const time = now();
      const o = { id:'DEMO'+time.toString(36).toUpperCase()+sequence, requestId, productId:p.id, name:p.shortName, price:p.price, items:p.items.slice(), art:p.art, code, status:'unused', quantity:1, createdAt:time, expiresAt:time+7*24*60*60*1000, mock:true, merchantId:'demo-fruit-store' };
      s.sequence = sequence; s.inventory[p.id]--; s.orders.push(o);
      s.ledger.push({ type:'mock_purchase', orderId:o.id, at:time }); save(s); return decorate(o);
    }
    function lookup(input) {
      const code = String(input || '').replace(/\s/g,'');
      if (!/^\d{8}$/.test(code)) fail('请输入 8 位测试提货码。');
      const o = read().orders.find(x=>x.code===code);
      if (!o) fail('未找到此测试码，请确认在当前演示中购买过。');
      return decorate(o);
    }
    function redeem(input) {
      const found = lookup(input); const s = read(); const o = s.orders.find(x=>x.id===found.id);
      if (status(o) === 'redeemed') fail('这张券已经核销，请勿重复交付。');
      if (status(o) === 'refunded') fail('这张券已模拟退款，不能核销。');
      if (status(o) === 'expired') fail('这张券已过期，不能核销。');
      o.status='redeemed'; o.redeemedAt=now(); s.ledger.push({type:'redeem',orderId:o.id,at:o.redeemedAt}); save(s); return decorate(o);
    }
    function refund(id) {
      const s = read(); const o = s.orders.find(x=>x.id===id);
      if (!o) fail('订单不存在。');
      if (status(o) !== 'unused') fail('仅待提货测试订单可以模拟退款。');
      o.status='refunded'; o.refundedAt=now(); s.inventory[o.productId]++;
      s.ledger.push({type:'mock_refund',orderId:o.id,at:o.refundedAt}); save(s); return decorate(o);
    }
    function stats() { const list=orders(); return {unused:list.filter(o=>o.status==='unused').length, redeemed:list.filter(o=>o.status==='redeemed').length, total:list.length, amountText:money(list.filter(o=>o.status!=='refunded').reduce((n,o)=>n+o.price,0))}; }
    return {products,product,orders,order,purchase,lookup,redeem,refund,stats,reset:()=>save(fresh())};
  }
  return { create, money, date, STORE, KEY };
});
