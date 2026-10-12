export const experimentGroups = [
  { phase: 2, title: "基础与微信登录", steps: [
    ["merchant_profile", "商家资料"], ["mini_program_registration", "小程序注册"],
    ["app_id", "取得 AppID"], ["wechat_login", "真实微信登录与 OpenID"],
  ] },
  { phase: 5, title: "微信支付", steps: [
    ["merchant_id", "取得商户号"], ["appid_binding", "商户号绑定小程序"],
    ["api_v3_settings", "配置 APIv3 参数"], ["cent_payment", "真实 0.01 元支付"],
    ["payment_callback", "真实支付回调"], ["payment_query", "查询支付订单"],
    ["refund_test", "真实退款测试"],
  ] },
  { phase: 7, title: "团购系统", steps: [
    ["product_create", "创建商品"], ["product_display", "小程序展示商品"],
    ["order_create", "创建订单"], ["wechat_payment", "调起微信支付"],
    ["paid_state", "订单支付确认"], ["voucher_issue", "生成团购券"],
    ["voucher_qr", "显示券二维码"], ["voucher_redeem", "到店核销"],
    ["voucher_duplicate", "重复核销拦截"], ["voucher_reverse", "撤销误核销"],
  ] },
  { phase: 10, title: "POI 认领", steps: [
    ["poi_search", "搜索门店位置"], ["poi_claim", "已有则认领／没有则创建"],
    ["poi_documents", "上传商家资料"], ["poi_entity_verify", "主体验证"],
    ["poi_legal_verify", "法人验证"], ["poi_review", "微信 POI 审核"],
    ["poi_permission", "获得位置管理权限"],
  ] },
  { phase: 11, title: "位置服务", steps: [
    ["location_entry", "找到位置服务入口"], ["location_bind_app", "关联小程序"],
    ["location_create_service", "创建团购服务"], ["location_path", "配置页面 Path"],
    ["location_params", "配置门店参数"], ["location_scan", "扫码测试"],
    ["location_submit", "提交审核"], ["location_approved", "审核通过"],
    ["location_merchant_confirm", "商家确认挂载"],
  ] },
  { phase: 12, title: "视频号与最终闭环", steps: [
    ["video_publish", "发布测试视频"], ["video_attach_poi", "视频挂门店 POI"],
    ["video_click_poi", "点击 POI"], ["video_location_page", "打开位置页"],
    ["video_click_service", "点击团购服务"], ["video_open_app", "进入小程序"],
    ["flow_poi", "视频 → POI"], ["flow_app", "POI → 小程序"],
    ["flow_product", "小程序 → 商品"], ["flow_payment", "商品 → 微信支付"],
    ["flow_voucher", "支付 → 出券"], ["flow_store", "团购券 → 到店"],
    ["flow_redeem", "到店 → 核销"],
  ] },
] as const;

export const stepKeys = new Set<string>(experimentGroups.flatMap((group) => group.steps.map(([key]) => key)));
