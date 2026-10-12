/* 所有订单均为本机模拟数据。本页面不请求微信支付或任何外部业务接口。 */
const demo = FruitDemo.create({ get:k=>localStorage.getItem(k), set:(k,v)=>localStorage.setItem(k,v) });
const $ = s => document.querySelector(s);
const ui = { view:new URLSearchParams(location.search).get('flow')==='poi'?'video':'home', role:'customer', category:'全部', filter:'全部', productId:'family', orderId:null, requestId:'', lookup:null, code:'', error:'' };
const art = id => `../miniprogram/assets/${id}.svg`;
const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price = p => `<span class="price"><em>¥</em>${p}<small>演示价</small></span>`;
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3200); }
function go(view) { ui.view=view; render(); $('#app').scrollTop=0; }
function header(title,back='home') { return `<div class="screen-head"><button class="back" aria-label="返回" data-action="go" data-view="${back}">‹</button><h2>${title}</h2></div>`; }
function nav(active) { return `<nav class="bottom-nav"><button class="${active==='home'?'active':''}" data-action="go" data-view="home"><span class="nav-icon">◒</span>逛果铺</button><button class="${active==='orders'?'active':''}" data-action="go" data-view="orders"><span class="nav-icon">▤</span>我的提货券</button><button data-action="help"><span class="nav-icon">ⓘ</span>演示说明</button></nav>`; }
function renderHome() {
  const ps=demo.products().filter(p=>ui.category==='全部'||p.category===ui.category);
  return `<section class="home-hero"><span class="tiny">FRESH PICKS · 邻里鲜选</span><h2>今天的鲜甜，<br>给生活加点料。</h2><p>线上选好 · 到店轻松提</p><img class="hero-art" src="${art('family')}" alt="一袋苹果、橙子和香蕉的插画"><span class="hero-pill">一份新鲜，一份日常的小确幸</span></section><div class="store-strip"><div><strong>⌖ 石桥花园周边 · 演示门店</strong><small>虚拟门店，不提供真实提货服务</small></div><span class="leaf">到店自提</span></div><div class="section-head"><h3>今日鲜选</h3><span>固定规格 · 简单好选</span></div><div class="filters">${['全部','组合装','单品装'].map(c=>`<button class="${ui.category===c?'active':''}" data-action="category" data-value="${c}">${c}</button>`).join('')}</div><div class="product-list">${ps.map(p=>`<button class="product-card" data-action="detail" data-id="${p.id}"><div class="product-art" style="background:${p.color}"><img src="${art(p.art)}" alt="${p.shortName}插画"></div><div class="product-copy"><span class="tag">${p.tag}</span><h4>${p.shortName}</h4><p>${p.subtitle.split(' · ')[0]}</p><div class="price-row">${price(p.priceText)}<span class="round-plus">${p.stock>0?'+':'–'}</span></div></div></button>`).join('')}<p class="small-note">商品、图片、库存和价格均用于演示</p></div>${nav('home')}`;
}
function renderDetail() {
  const p=demo.product(ui.productId);
  return `${header('套餐详情')}<div class="detail-art" style="background:${p.color}"><img src="${art(p.art)}" alt="${p.shortName}插画"><span class="art-label">商品插画 · 仅供演示</span></div><div class="detail-title"><span class="badge">${p.tag} / 到店自提</span><h2>${p.name}</h2><p>${p.shortName} · ${p.subtitle}</p><div class="price-row">${price(p.priceText)}<span class="muted" style="font-size:11px">测试库存 ${p.stock} 份</span></div></div><section class="detail-section"><h3>这一份里，有什么</h3><ul>${p.items.map(i=>`<li>${i}</li>`).join('')}</ul><p>${p.description}</p></section><section class="detail-section"><h3>购买与提货须知</h3><ul><li>一单一份，一张券一次性提货。</li><li>测试券从模拟购买起有效期 7 天。</li><li>仅当前虚拟门店适用，不含配送。</li><li>未使用且未过期可模拟退款；已核销不可退。</li></ul><p class="rule">这是测试体验，不会扣款，不提供真实商品。</p></section><div class="buy-bar">${price(p.priceText)}<button class="primary" data-action="checkout" ${p.stock===0?'disabled':''}>${p.stock===0?'已售罄':'选这份 · 模拟购买'}</button></div>`;
}
function renderCheckout() {
  const p=demo.product(ui.productId);
  return `${header('确认测试订单','detail')}<div class="screen-body"><div class="summary-card summary-product"><img src="${art(p.art)}" alt=""><div><h3>${p.shortName}</h3><p>固定规格 / 数量 × 1</p><p style="margin-top:8px">¥${p.priceText}</p></div></div><div class="summary-card"><h3>⌖ 到店自提</h3><p>邻里果铺 · 虚拟演示门店</p><p>武汉 · 石桥花园周边场景</p><p>此处不是实际提货地址</p></div><div class="summary-card"><div class="row"><span class="muted">套餐金额</span><span>¥${p.priceText}</span></div><div class="row"><span class="muted">提货方式</span><span>凭测试码核销</span></div><div class="row"><strong>模拟应付</strong>${price(p.priceText)}</div><div class="row"><span class="muted">实际扣款</span><strong>¥0.00</strong></div></div><div class="notice">本次使用模拟支付。完成后会生成测试提货码，不会调用微信支付，不会产生真实交易。</div><label class="agree"><input type="checkbox" id="agree">我已了解套餐规格、7 天有效期和模拟退款规则，并知道此订单仅供演示。</label><button class="primary wide" data-action="pay" id="pay-button" disabled>确认模拟支付 · 不扣款</button></div>`;
}
function renderCoupon() {
  const o=demo.order(ui.orderId);
  const done=o.status==='redeemed';
  return `${header('我的提货券','orders')}<div class="success-head"><div class="success-icon">${o.status==='unused'?'✓':done?'✓':'–'}</div><h2>${o.status==='unused'?'鲜果已选好，等你来提':o.statusLabel}</h2><p>${o.status==='unused'?'模拟购买成功 · 没有真实扣款':'测试订单 · 状态已更新'}</p></div><div class="ticket"><span class="badge">${o.statusLabel}</span><h3 style="margin-top:17px">${o.name}</h3><p>邻里果铺 · 一份 / 一次核销</p><div class="ticket-divider"></div><p>测试提货码</p><div class="ticket-code ${o.status!=='unused'?'invalid':''}">${o.codeText}</div><p>有效期至 ${o.expiryText}</p><div class="ticket-actions"><button class="secondary" data-action="copy" data-code="${o.code}">复制测试码</button>${o.canRefund?`<button class="danger" data-action="refund" data-id="${o.id}">模拟退款</button>`:''}</div><div class="ticket-divider"></div><p>模拟支付 ¥${o.priceText} · 实际扣款 ¥0.00</p><p>订单编号 ${o.id}</p></div><div class="screen-body" style="padding-top:0">${o.canRedeem?`<button class="primary wide" data-action="handoff" data-code="${o.code}">试试店员核销 →</button><p class="small-note">演示快捷切换，测试码会自动填入工作台</p>`:`<button class="primary wide" data-action="go" data-view="home">继续逛果铺</button>`}</div>`;
}
function renderOrders() {
  const all=demo.orders(); const list=all.filter(o=>ui.filter==='全部'||(ui.filter==='待提货'?o.status==='unused':o.status!=='unused'));
  return `${header('我的提货券')}<div class="filters" style="padding-top:18px">${['全部','待提货','已结束'].map(f=>`<button class="${ui.filter===f?'active':''}" data-action="filter" data-value="${f}">${f}</button>`).join('')}</div><div class="order-list">${list.length?list.map(o=>`<article class="order-card"><div class="order-top"><span class="muted">${o.createdText}</span><b>${o.statusLabel}</b></div><h3>${o.name}</h3><p>固定规格 × 1 · 模拟支付</p><div class="order-bottom">${price(o.priceText)}<button class="secondary" data-action="coupon" data-id="${o.id}">查看提货券</button></div></article>`).join(''):`<div class="empty"><div class="empty-icon">◒</div><h3>${all.length?'还没有这类提货券':'第一份鲜果，等你来挑'}</h3><p>挑一个套餐，完成模拟购买，<br>提货券就会出现在这里。</p><button class="primary" data-action="go" data-view="home">去选鲜果</button></div>`}</div>${nav('orders')}`;
}
function renderMerchant() {
  const s=demo.stats(); const all=demo.orders(); const pending=all.filter(o=>o.status==='unused');
  return `<div class="merchant-header"><span class="eyebrow">STORE WORKSPACE</span><h2>今天，也要好好交付。</h2><p>邻里果铺 · 店员演示工作台</p></div><div class="stats"><div><strong>${s.unused}</strong><span>待提货</span></div><div><strong>${s.redeemed}</strong><span>已核销</span></div><div><strong>${s.total}</strong><span>测试订单</span></div></div><section class="redeem-panel"><h3>输入提货码，核对这一单</h3><p>先查询套餐和状态，确认交付内容后再核销。</p><input class="code-input" id="redeem-code" inputmode="numeric" maxlength="9" autocomplete="off" aria-label="测试提货码" placeholder="输入 8 位测试提货码" value="${escapeHTML(ui.code)}"><button class="primary wide" data-action="lookup">查询测试券</button>${ui.error?`<div class="inline-error" role="alert">${escapeHTML(ui.error)}</div>`:''}${ui.lookup?`<div class="lookup-card"><span class="badge">${ui.lookup.statusLabel}</span><h4 style="margin-top:12px">${ui.lookup.name}</h4><p>${ui.lookup.items.join(' / ')}</p><p>测试码 ${ui.lookup.codeText}</p><p>有效期至 ${ui.lookup.expiryText}</p>${ui.lookup.canRedeem?`<button class="primary wide" data-action="redeem" data-code="${ui.lookup.code}">核对无误 · 确认核销</button>`:`<div class="notice">${ui.lookup.status==='redeemed'?'此券已经核销，请勿重复交付。':ui.lookup.status==='refunded'?'此券已模拟退款，不可提货。':'此券已过期，不可提货。'}</div>`}</div>`:''}</section><h3 class="ledger-title">待提货清单 <span class="muted">${pending.length}</span></h3><div style="padding:0 17px">${pending.length?pending.map(o=>`<button class="quick-order" data-action="select-code" data-code="${o.code}"><div><strong>${o.name}</strong><small>测试码 ${o.codeText}</small></div><span>核对 →</span></button>`).join(''):`<p class="small-note" style="padding:15px 0">还没有待提货订单，先切换顾客逛店试着购买。</p>`}</div>${all.some(o=>o.status!=='unused')?`<h3 class="ledger-title">最近处理</h3><div style="padding:0 17px 10px">${all.filter(o=>o.status!=='unused').slice(0,5).map(o=>`<div class="quick-order"><div><strong>${o.name}</strong><small>${o.codeText}</small></div><span>${o.statusLabel}</span></div>`).join('')}</div>`:''}<p class="small-note" style="padding:12px 20px 22px">角色切换仅为演示，不代表真实员工登录权限。<br>本机测试数据，不支持多人或跨设备同步。</p>`;
}
function render() {
  $('#role-customer').classList.toggle('active',ui.role==='customer'); $('#role-merchant').classList.toggle('active',ui.role==='merchant');
  ['step1','step2','step3'].forEach((id,i)=>$('#'+id).classList.toggle('current',i===(ui.role==='merchant'?2:['checkout','coupon','orders'].includes(ui.view)?1:0)));
  updateFlowGuide();
  try { $('#app').innerHTML=ui.role==='merchant'?renderMerchant():({home:renderHome,detail:renderDetail,checkout:renderCheckout,coupon:renderCoupon,orders:renderOrders,video:renderVideo,publish:renderPublish,location:renderLocation}[ui.view]||renderHome)(); }
  catch(error){ $('#app').innerHTML=`<div class="empty"><h3>演示数据需要处理</h3><p>${escapeHTML(error.message)}</p><button class="primary" data-action="help">打开演示说明</button></div>`; }
}
function closeModal() { $('#modal-root').innerHTML=''; if(ui.lastFocus && document.contains(ui.lastFocus))ui.lastFocus.focus(); }
function modal(title,body,buttons) {
  ui.lastFocus=document.activeElement;
  $('#modal-root').innerHTML=`<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${title}</h2>${body}<div class="modal-actions">${buttons}</div></section></div>`;
  $('#modal-root button').focus();
}
document.addEventListener('change',e=>{if(e.target.id==='agree')$('#pay-button').disabled=!e.target.checked;});
document.addEventListener('input',e=>{if(e.target.id==='redeem-code') {ui.code=e.target.value;ui.lookup=null;ui.error='';document.querySelector('.lookup-card')?.remove();document.querySelector('.inline-error')?.remove();}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.key==='Enter'&&e.target.id==='redeem-code')document.querySelector('[data-action="lookup"]').click();
  if(e.key==='Tab'&&$('#modal-root').firstChild){const b=[...$('#modal-root').querySelectorAll('button')]; const first=b[0],last=b[b.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]'); if(!b||b.disabled)return;
  const a=b.dataset.action;
  try {
    if(a==='go'){ui.role='customer';go(b.dataset.view);}
    else if(a==='role'){ui.role=b.dataset.role;if(ui.role==='customer')ui.view='home';else{ui.lookup=null;ui.error='';}render();$('#app').scrollTop=0;}
    else if(a==='category'){ui.category=b.dataset.value;render();}
    else if(a==='filter'){ui.filter=b.dataset.value;render();}
    else if(a==='detail'){ui.productId=b.dataset.id;go('detail');}
    else if(a==='checkout'){ui.requestId='request-'+Date.now()+'-'+Math.random().toString(36).slice(2);go('checkout');}
    else if(a==='pay'){if(!$('#agree').checked)return;b.disabled=true;const o=demo.purchase(ui.productId,ui.requestId);ui.orderId=o.id;go('coupon');toast('模拟购买成功，实际扣款 ¥0.00');}
    else if(a==='coupon'){ui.orderId=b.dataset.id;go('coupon');}
    else if(a==='copy'){try{await navigator.clipboard.writeText(b.dataset.code);toast('测试提货码已复制');}catch{toast('请手动记录测试码：'+b.dataset.code);}}
    else if(a==='handoff'){ui.role='merchant';ui.code=b.dataset.code;ui.lookup=null;ui.error='';render();$('#app').scrollTop=0;}
    else if(a==='select-code'){ui.code=b.dataset.code;ui.lookup=demo.lookup(ui.code);ui.error='';render();$('#app').scrollTop=0;}
    else if(a==='lookup'){ui.code=$('#redeem-code').value;ui.lookup=null;ui.error='';try{ui.lookup=demo.lookup(ui.code);}catch(err){ui.error=err.message;}render();}
    else if(a==='redeem'){const o=demo.lookup(b.dataset.code);modal('确认已核对提货内容？',`<p>${o.name}<br>测试码 ${o.codeText}<br>确认后，此测试券将标记为已提货，不能再次核销。</p>`,`<button class="secondary" data-action="close">再核对一下</button><button class="primary" data-action="confirm-redeem" data-code="${o.code}">确认核销</button>`);}
    else if(a==='confirm-redeem'){ui.lookup=demo.redeem(b.dataset.code);closeModal();render();toast('核销成功，此测试券已使用');}
    else if(a==='refund'){modal('模拟退款？','<p>测试券将作废，对应测试库存恢复。本次没有真实资金退回，因为购买时没有实际扣款。</p>',`<button class="secondary" data-action="close">保留提货券</button><button class="primary" data-action="confirm-refund" data-id="${b.dataset.id}">确认模拟退款</button>`);}
    else if(a==='confirm-refund'){demo.refund(b.dataset.id);closeModal();render();toast('模拟退款完成，测试券已作废');}
    else if(a==='help'){modal('这是一家演示果铺',`<p>用它向商家展示“选套餐 → 模拟购买 → 出券 → 到店核销”。所有商品、价格和地址都是演示数据。</p><ul><li>不会扣款，不会发货。</li><li>浏览器与原生小程序分别保存本机数据。</li><li>未接入 POI、云数据库、真实支付或员工认证。</li></ul><button class="mini-link" data-action="reset">清空测试订单，恢复初始库存</button>`,`<button class="primary" data-action="close">明白了，开始体验</button>`);}
    else if(a==='reset'){modal('重置当前演示？','<p>只会删除当前浏览器的测试订单，并恢复三款商品的初始库存。</p>','<button class="secondary" data-action="close">取消</button><button class="primary" data-action="confirm-reset">重置测试数据</button>');}
    else if(a==='confirm-reset'){demo.reset();Object.assign(ui,{view:'home',role:'customer',lookup:null,code:'',error:'',orderId:null,filter:'全部'});closeModal();render();toast('演示已重置');}
    else if(a==='close')closeModal();
  }catch(error){toast(error.message);if(a==='pay')b.disabled=false;}
});
window.addEventListener('storage',e=>{if(e.key===FruitDemo.KEY){ui.lookup=null;render();}});
render();
