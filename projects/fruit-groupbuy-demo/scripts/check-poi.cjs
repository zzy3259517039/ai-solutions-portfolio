const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8766/?flow=poi');
  await page.locator('.poi-card').waitFor();
  await page.screenshot({path:path.join(__dirname,`../screenshots/poi-video-${width}.png`),fullPage:true});
  await page.locator('.flow-launcher [data-view="publish"]').click();
  assert.equal(await page.locator('[data-faction="publish"]').isDisabled(),true);
  await page.locator('[data-faction="select"]').click();await page.locator('[data-faction="publish"]').click();
  await page.locator('.poi-card').click();
  await page.locator('[data-faction="bound"][data-value="no"]').click();
  assert.equal(await page.locator('.service-card').count(),0);
  assert.match(await page.locator('.missing-service').innerText(),/没有交易服务入口/);
  await page.locator('[data-faction="bound"][data-value="yes"]').click();
  await page.screenshot({path:path.join(__dirname,`../screenshots/poi-location-${width}.png`),fullPage:true});
  await page.locator('.service-card [data-view="home"]').click();
  await page.locator('[data-action="detail"][data-id="family"]').click();await page.locator('[data-action="checkout"]').click();
  await page.locator('#agree').check();await page.locator('#pay-button').click();
  await page.locator('[data-action="handoff"]').click();await page.locator('[data-action="lookup"]').click();
  await page.locator('[data-action="redeem"]').click();await page.locator('[data-action="confirm-redeem"]').click();
  assert.match(await page.locator('.lookup-card').innerText(),/已经核销/);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.close();
 }
 await browser.close();console.log('PASS: desktop/mobile simulated publish -> video -> POI with/without service -> purchase -> coupon -> redemption.');
})().catch(e=>{console.error(e);process.exit(1);});
