import { API_BASE_URL } from "../../config";

type Order = {
  id: number; order_no: string; product_name: string; quantity: number;
  amount: number; status: string; expires_at: string;
};

type OrderPage = {
  data: { orderId: number; order: Order | null };
  setData(data: Record<string, unknown>): void;
};

Page({
  data: { orderId: 0, order: null as Order | null, amountYuan: "", message: "正在加载订单…" },

  onLoad(this: OrderPage, options: { order_id?: string }) {
    const id = Number(options.order_id);
    if (!Number.isSafeInteger(id) || id < 1) { this.setData({ message: "订单 ID 无效" }); return; }
    this.setData({ orderId: id });
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/orders/${id}`, method: "GET",
      header: { authorization: `Bearer ${token}` },
      success(response) {
        const payload = response.data as { order?: Order } | null;
        if (response.statusCode !== 200 || !payload?.order) {
          page.setData({ message: "订单不存在或登录已失效" }); return;
        }
        page.setData({
          order: payload.order,
          amountYuan: (payload.order.amount / 100).toFixed(2),
          message: "",
        });
      },
      fail() { page.setData({ message: "无法连接后端" }); },
    });
  },

  onCancel(this: OrderPage) {
    if (!this.data.order || this.data.order.status !== "PENDING") return;
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/orders/${page.data.orderId}/cancel`,
      method: "POST", header: { authorization: `Bearer ${token}` },
      success(response) {
        if (response.statusCode !== 200) { page.setData({ message: "订单无法取消" }); return; }
        page.setData({ order: { ...page.data.order, status: "CLOSED" }, message: "订单已取消" });
      },
      fail() { page.setData({ message: "无法连接后端" }); },
    });
  },

  onPay(this: OrderPage) {
    if (!this.data.order || this.data.order.status !== "PENDING") return;
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    page.setData({ message: "正在创建支付请求…" });
    wx.request({
      url: `${API_BASE_URL}/api/orders/${page.data.orderId}/prepay`, method: "POST",
      header: { authorization: `Bearer ${token}` },
      success(response) {
        const params = response.data as {
          timeStamp?: string; nonceStr?: string; package?: string; signType?: "RSA"; paySign?: string;
          error?: string;
        };
        if (response.statusCode !== 200 || !params.timeStamp || !params.nonceStr || !params.package || !params.paySign) {
          page.setData({ message: `无法发起支付：${params?.error ?? "请稍后重试"}` }); return;
        }
        wx.requestPayment({
          timeStamp: params.timeStamp, nonceStr: params.nonceStr, package: params.package,
          signType: "RSA", paySign: params.paySign,
          success() { page.setData({ message: "支付已返回，正在等待服务端确认，请稍后重新进入订单页查看。" }); },
          fail(result) { page.setData({ message: result.errMsg?.includes("cancel") ? "你已取消支付" : "支付未完成，请稍后查看订单状态" }); },
        });
      },
      fail() { page.setData({ message: "无法连接后端" }); },
    });
  },

  onVouchers(this: OrderPage) {
    wx.navigateTo({ url: `/pages/vouchers/index?order_id=${this.data.orderId}` });
  },
  onRefreshPayment(this: OrderPage) {
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    page.setData({ message: "正在向微信支付核对订单…" });
    wx.request({
      url: `${API_BASE_URL}/api/orders/${page.data.orderId}/reconcile`,
      method: "POST", header: { authorization: `Bearer ${token}` },
      success(response) {
        const result = response.data as { status?: string };
        if (response.statusCode !== 200 || !result?.status) {
          page.setData({ message: "暂时无法核对，请稍后重试" }); return;
        }
        page.setData({
          order: { ...page.data.order, status: result.status },
          message: result.status === "PAID" ? "已确认支付，可以查看核销券" : "微信支付尚未确认成功",
        });
      }, fail() { page.setData({ message: "无法连接后端" }); },
    });
  },
  onRefundRequest(this: OrderPage) {
    if (!this.data.order || this.data.order.status !== "PAID") return;
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    wx.showModal({ title: "申请退款", content: "请填写退款原因；已使用的券无法自动退款。",
      editable: true, placeholderText: "退款原因",
      success(result) {
        const reason = result.content?.trim();
        if (!result.confirm || !reason) return;
        wx.request({
          url: `${API_BASE_URL}/api/orders/${page.data.orderId}/refund-request`,
          method: "POST", header: { authorization: `Bearer ${token}` }, data: { reason },
          success(response) {
            page.setData({ message: response.statusCode === 201 ?
              "已提交退款申请，请等待商家处理" : "无法申请退款，请确认券未核销且订单未申请过退款" });
          }, fail() { page.setData({ message: "无法连接后端" }); },
        });
      },
    });
  },
});
