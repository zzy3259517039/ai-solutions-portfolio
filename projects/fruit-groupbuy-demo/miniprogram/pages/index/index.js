const core = require('../../utils/core');
const demo = core.create({get:key=>wx.getStorageSync(key),set:(key,value)=>wx.setStorageSync(key,value)});
Page({
  data: { view:'home', role:'customer', category:'全部', categories:['全部','组合装','单品装'], products:[], orders:[], pending:[], stats:{}, product:null, order:null, agreed:false, code:'', lookup:null, error:'', busy:false },
  onLoad() { this.refresh(); },
  onShow() { this.refresh(); },
  notice(message) { wx.showToast({title:message,icon:'none',duration:2500}); },
  guard(fn) { try { return fn(); } catch(e) { this.notice(e.message); return null; } },
  refresh() {
    this.guard(()=>{
      const orders=demo.orders();
      this.setData({products:demo.products().filter(p=>this.data.category==='全部'||p.category===this.data.category),orders,pending:orders.filter(o=>o.status==='unused'),stats:demo.stats()});
      if(this.data.product)this.setData({product:demo.product(this.data.product.id)});
      if(this.data.order)this.setData({order:demo.order(this.data.order.id)});
    });
  },
  go(e) { this.navigate(e.currentTarget.dataset.view); },
  navigate(view) { this.setData({view});this.refresh();wx.pageScrollTo({scrollTop:0,duration:0}); },
  setRole(e) { this.setData({role:e.currentTarget.dataset.role,view:'home',lookup:null,error:''});this.refresh();wx.pageScrollTo({scrollTop:0,duration:0}); },
  setCategory(e) { this.setData({category:e.currentTarget.dataset.value});this.refresh(); },
  detail(e) { this.guard(()=>{this.setData({product:demo.product(e.currentTarget.dataset.id)});this.navigate('detail');}); },
  checkout() { this.requestId='request-'+Date.now()+'-'+Math.random().toString(36).slice(2);this.setData({agreed:false});this.navigate('checkout'); },
  agreement(e) { this.setData({agreed:e.detail.value.includes('agree')}); },
  pay() {
    if(!this.data.agreed||this.data.busy)return;
    this.setData({busy:true});
    this.guard(()=>{const order=demo.purchase(this.data.product.id,this.requestId);this.setData({order});this.navigate('coupon');this.notice('模拟购买成功，没有扣款');});
    this.setData({busy:false});
  },
  openCoupon(e) { this.guard(()=>{this.setData({order:demo.order(e.currentTarget.dataset.id)});this.navigate('coupon');}); },
  copy() { wx.setClipboardData({data:this.data.order.code}); },
  handoff() { this.setData({role:'merchant',code:this.data.order.code,lookup:null,error:''});this.refresh();wx.pageScrollTo({scrollTop:0,duration:0}); },
  codeInput(e) { this.setData({code:e.detail.value,lookup:null,error:''}); },
  selectCode(e) { this.setData({code:e.currentTarget.dataset.code});this.query();wx.pageScrollTo({scrollTop:0,duration:0}); },
  query() { try { this.setData({lookup:demo.lookup(this.data.code),error:''}); } catch(e) {this.setData({lookup:null,error:e.message});} },
  redeem() {
    const code=this.data.lookup&&this.data.lookup.code;
    if(!code)return;
    wx.showModal({title:'确认核销测试券？',content:'请核对套餐内容。确认后券将标记为已提货，不能重复核销。',confirmText:'确认核销',confirmColor:'#244e3e',success:r=>{if(r.confirm)this.guard(()=>{this.setData({lookup:demo.redeem(code)});this.refresh();this.notice('核销成功');});}});
  },
  refund() {
    wx.showModal({title:'确认模拟退款？',content:'此操作会作废测试券并恢复测试库存，没有真实资金退回。',confirmColor:'#244e3e',success:r=>{if(r.confirm)this.guard(()=>{demo.refund(this.data.order.id);this.refresh();this.notice('模拟退款完成');});}});
  },
  help() { wx.showModal({title:'演示说明',content:'虚拟门店与测试套餐，不收款、不发货。数据仅保存在当前设备；未接入云数据库、POI、真实支付或员工身份认证。店员切换只用于演示。',showCancel:false,confirmColor:'#244e3e'}); },
  reset() { wx.showModal({title:'重置测试数据？',content:'清空当前设备的测试订单，恢复初始库存。',confirmColor:'#244e3e',success:r=>{if(r.confirm)this.guard(()=>{demo.reset();this.setData({view:'home',role:'customer',product:null,order:null,lookup:null,code:'',error:'',category:'全部'});this.refresh();});}}); }
});
