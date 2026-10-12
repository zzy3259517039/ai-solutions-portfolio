import { API_BASE_URL } from "../../config";

type OrderSummary = {
  id: number; order_no: string; product_name: string; amount: number;
  quantity: number; status: string; display_status: string; amountYuan?: string;
};
type OrdersPage = { data: { orders: OrderSummary[] }; setData(data: Record<string, unknown>): void };

Page({
  data: { orders: [] as OrderSummary[], message: "正在加载订单…" },
  onShow(this: OrdersPage) {
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先在首页登录微信" }); return; }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/orders`, method: "GET",
      header: { authorization: `Bearer ${token}` },
      success(response) {
        const result = response.data as { orders?: OrderSummary[] };
        if (response.statusCode !== 200 || !Array.isArray(result?.orders)) {
          page.setData({ message: "读取订单失败，请重新登录" }); return;
        }
        const orders = result.orders.map((order) => ({ ...order, amountYuan: (order.amount / 100).toFixed(2) }));
        page.setData({ orders, message: orders.length ? "" : "还没有订单" });
      }, fail() { page.setData({ message: "无法连接后端" }); },
    });
  },
  onOpenOrder(event: { currentTarget: { dataset: { id: number } } }) {
    const id = Number(event.currentTarget.dataset.id);
    if (Number.isSafeInteger(id) && id > 0) wx.navigateTo({ url: `/pages/order/confirm?order_id=${id}` });
  },
});
