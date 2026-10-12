/* 学习用概念模型，不复刻或声明微信当前菜单、权限、审核和跳转层级。 */
const poiDemo = { selected:false, published:false, bound:true, playing:true };
function guideBox(step,title,text) { return `<div class="flow-guide"><span>${step}</span><div><strong>${title}</strong><p>${text}</p></div></div>`; }
function renderVideo() {
  return `<div class="flow-disclaimer">视频号场景模拟 · 插画代替实拍 · 无真实发布</div><section class="video-mock ${poiDemo.playing?'playing':''}"><div class="video-top"><span>发现邻里的新鲜</span><button data-action="go" data-view="publish">试试发布 →</button></div><div class="video-story"><span>今日鲜选</span><h2>回家路上，<br>带一袋新鲜。</h2><img src="${art('family')}" alt="水果袋动态插画"><button class="video-play" data-faction="play" aria-label="${poiDemo.playing?'暂停插画动画':'播放插画动画'}">${poiDemo.playing?'Ⅱ':'▶'}</button><small>动态插画示意，并非真实视频</small></div><div class="video-author"><strong>◒ 邻里果铺 · 演示账号</strong><p>苹果、橙子、香蕉，一袋装好。路过小店，顺手提走。</p><button class="poi-card" data-action="go" data-view="location"><span class="poi-pin">⌖</span><span><strong>邻里果铺 · 石桥花园演示店</strong><small>点这里，看看门店位置与服务</small></span><b>›</b></button></div></section>${guideBox('01','顾客先看到内容','试着点击视频下方的门店位置卡片。位置入口和套餐购买是不同环节。')}`;
}
function renderPublish() {
  return `${header('商家发布流程 · 概念模拟','video')}<div class="flow-disclaimer">不是真实后台教程；实际入口以账号页面为准</div><div class="screen-body"><div class="publish-preview"><img src="${art('family')}" alt="演示封面"><div><strong>今天的鲜果，已经装好。</strong><p>模拟素材 · 不会上传到任何平台</p></div></div><div class="summary-card"><h3>准备展示给街坊的内容</h3><p>家庭水果分享袋，固定规格，到店自提。</p><p class="muted">这里只演示发布与位置的关系，不实际拍摄、上传或发布视频。</p></div><div class="summary-card"><h3>为内容选择门店位置</h3><button class="location-select" data-faction="select"><span>⌖ 邻里果铺 · 演示门店<small>虚拟位置，仅在当前页面内选择</small></span><b>${poiDemo.selected?'✓ 已选择':'＋ 选择'}</b></button></div><div class="notice">真实操作前，商家需确认位置认领、账号可用权限与入口配置。选择位置本身不会自动开通交易能力。</div><button class="primary wide" data-faction="publish" ${poiDemo.selected?'':'disabled'}>${poiDemo.published?'再次模拟发布':'模拟发布 · 不会真的发出去'}</button>${poiDemo.published?'<p class="small-note">上一次模拟发布已完成，可重复体验。</p>':''}</div>${guideBox('准备','商家这一边做什么','理解顺序：准备内容 → 选择可用门店位置 → 发布后检查入口。本页不表示真实后台只有这些步骤。')}`;
}
function renderLocation() {
  return `${header('门店位置页 · 概念模拟','video')}<div class="flow-disclaimer">假设场景：位置页是否已有可用的小程序服务入口</div><div class="mock-map" aria-label="虚拟地图示意，不提供导航"><div class="map-road road-one"></div><div class="map-road road-two"></div><span class="map-block block-one"></span><span class="map-block block-two"></span><span class="map-block block-three"></span><div class="map-marker">◒<small>邻里果铺</small></div><span class="map-caption">地图示意 · 非真实坐标</span></div><div class="location-title"><span class="badge">虚拟演示门店</span><h2>邻里果铺</h2><p>武汉 · 石桥花园周边场景</p><p>无真实地址，不提供导航、拨号或到店服务</p></div><div class="connection-switch"><div><strong>比较两种情况</strong><small>此开关仅改变演示画面，不开通任何平台权限</small></div><div class="connection-options"><button data-faction="bound" data-value="no" class="${!poiDemo.bound?'active':''}">只有位置</button><button data-faction="bound" data-value="yes" class="${poiDemo.bound?'active':''}">假设已关联服务</button></div></div>${poiDemo.bound?`<section class="detail-section"><h3>门店服务 · 假设已具备接入条件</h3><div class="service-card"><img src="${art('orange')}" alt="鲜橙插画"><div><strong>邻里果铺 · 鲜果套餐</strong><p>选择套餐，模拟购买后到店核销</p><button class="primary" data-action="go" data-view="home">进入小程序演示 →</button></div></div></section>`:`<section class="detail-section missing-service"><h3>有门店位置，还不能在这里买套餐</h3><p>这个场景只有地点信息，没有交易服务入口。认领位置不等于已接通小程序。</p><p>可以切换上方“假设已关联服务”，比较接通后的概念效果。</p></section>`}${guideBox('02',poiDemo.bound?'从位置入口进入交易页面':'先有位置，再验证交易入口',poiDemo.bound?'点击“进入小程序演示”，后面就是你已经体验过的选套餐、购买和核销。实际跳转层级取决于平台开放能力。':'真实项目需核实该商家的权限与自研接入方式，不能用本演示开关代替办理。')}`;
}
function updateFlowGuide() {
  if(!document.querySelector('.flow-launcher')){
    const bar=document.createElement('div');bar.className='flow-launcher';bar.setAttribute('aria-label','选择演示场景');
    bar.innerHTML='<button data-action="go" data-view="publish">① 商家模拟发布</button><button data-action="go" data-view="video">② 顾客刷视频</button><button data-action="go" data-view="home">③ 小程序购买</button>';
    document.querySelector('.role-switch').before(bar);
    document.querySelector('.intro .eyebrow').textContent='从一条内容，到一次到店';
    document.querySelector('.intro h1').innerHTML='看见新鲜，<br>顺路带回家<span>。</span>';
    document.querySelector('.intro p').innerHTML='先体验视频与位置入口，<br>再走完购买、提货与核销。';
    document.querySelector('#step1 div').innerHTML='刷到视频，点击门店位置<small>可先切换“商家模拟发布”了解前一步</small>';
    document.querySelector('#step2 div').innerHTML='进入小程序，挑选鲜果<small>位置和交易入口分别演示</small>';
    document.querySelector('#step3 div').innerHTML='模拟购买，再切换店员核销<small>完整体验；没有真实支付或 POI 接入</small>';
  }
  document.querySelectorAll('.flow-launcher button').forEach(b=>b.classList.toggle('active',ui.role==='customer'&&(b.dataset.view===ui.view||(b.dataset.view==='video'&&ui.view==='location'))));
  ['step1','step2','step3'].forEach((id,i)=>document.getElementById(id).classList.toggle('current',i===(ui.role==='merchant'||['coupon','orders'].includes(ui.view)?2:['video','location','publish'].includes(ui.view)?0:1)));
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-faction]');if(!b||b.disabled)return;
  if(b.dataset.faction==='play'){poiDemo.playing=!poiDemo.playing;const box=document.querySelector('.video-mock');box.classList.toggle('playing',poiDemo.playing);b.textContent=poiDemo.playing?'Ⅱ':'▶';b.setAttribute('aria-label',poiDemo.playing?'暂停插画动画':'播放插画动画');}
  if(b.dataset.faction==='select'){poiDemo.selected=!poiDemo.selected;render();}
  if(b.dataset.faction==='publish'){if(!poiDemo.selected)return;poiDemo.published=true;go('video');toast('模拟发布完成，没有向任何平台发送内容');}
  if(b.dataset.faction==='bound'){poiDemo.bound=b.dataset.value==='yes';render();}
});
