const {test}=require('node:test');
const assert=require('node:assert/strict');
test('原生页面适配：勾选规则后购买，切换店员核销，订单状态刷新',()=>{
  const store={};let spec;
  global.wx={getStorageSync:k=>store[k],setStorageSync:(k,v)=>store[k]=v,showToast:()=>{},pageScrollTo:()=>{},showModal:o=>o.success&&o.success({confirm:true}),setClipboardData:()=>{}};
  global.Page=o=>spec=o;
  require('../miniprogram/pages/index/index.js');
  const page=Object.assign({},spec,{data:JSON.parse(JSON.stringify(spec.data)),setData(patch){Object.assign(this.data,patch);}});
  page.onLoad();page.detail({currentTarget:{dataset:{id:'family'}}});page.checkout();page.pay();
  assert.equal(page.data.orders.length,0);
  page.agreement({detail:{value:['agree']}});page.pay();
  assert.equal(page.data.view,'coupon');assert.equal(page.data.orders.length,1);
  page.handoff();page.query();assert.equal(page.data.lookup.canRedeem,true);page.redeem();
  assert.equal(page.data.lookup.status,'redeemed');assert.equal(page.data.orders[0].status,'redeemed');
  page.query();assert.equal(page.data.lookup.canRedeem,false);
  delete global.wx;delete global.Page;
});
