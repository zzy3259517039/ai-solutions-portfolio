import { API_BASE_URL } from "../../config";

type Product = {
  id: number; store_id: number; name: string; description: string;
  original_price: number; sale_price: number; stock: number;
  valid_days: number; store_name: string;
};

type ProductPage = {
  data: { product: Product | null; busy: boolean };
  setData(data: Record<string, unknown>): void;
};

Page({
  data: { product: null as Product | null, priceYuan: "", message: "正在加载…", busy: false },

  onLoad(this: ProductPage, options: { product_id?: string }) {
    const id = options.product_id ?? "";
    if (!/^\d+$/.test(id)) { this.setData({ message: "商品 ID 无效" }); return; }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/products/${id}`, method: "GET",
      success(response) {
        const payload = response.data as { product?: Product } | null;
        if (response.statusCode !== 200 || !payload?.product) {
          page.setData({ message: "商品不存在或已经下架" }); return;
        }
        page.setData({
          product: payload.product,
          priceYuan: (payload.product.sale_price / 100).toFixed(2),
          message: "",
        });
      },
      fail() { page.setData({ message: "无法连接后端" }); },
    });
  },

  onBuy(this: ProductPage) {
    const product = this.data.product;
    if (!product || this.data.busy) return;
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先回首页完成真实微信登录" }); return; }
    const page = this;
    page.setData({ busy: true, message: "正在创建订单…" });
    wx.request({
      url: `${API_BASE_URL}/api/orders`, method: "POST",
      header: { "content-type": "application/json", authorization: `Bearer ${token}` },
      data: { productId: product.id, quantity: 1 },
      success(response) {
        const payload = response.data as { id?: number; error?: string } | null;
        page.setData({ busy: false });
        if (response.statusCode !== 201 || !payload?.id) {
          page.setData({ message: `创建订单失败：${payload?.error ?? "请检查登录状态和库存"}` }); return;
        }
        wx.navigateTo({ url: `/pages/order/confirm?order_id=${payload.id}` });
      },
      fail() { page.setData({ busy: false, message: "无法连接后端" }); },
    });
  },
});
