import { API_BASE_URL } from "../../config";

type Voucher = {
  id: number; sequence_no: number; voucher_no: string; status: string;
  valid_until: string; qrPath?: string;
};
type VoucherPage = {
  data: { orderId: number; vouchers: Voucher[] };
  setData(data: Record<string, unknown>): void;
};

Page({
  data: { orderId: 0, vouchers: [] as Voucher[], message: "正在加载核销券…" },
  onLoad(this: VoucherPage, options: { order_id?: string }) {
    const id = Number(options.order_id);
    if (!Number.isSafeInteger(id) || id < 1) { this.setData({ message: "订单 ID 无效" }); return; }
    this.setData({ orderId: id });
    const token = wx.getStorageSync("poi_lab_session_token");
    if (!token) { this.setData({ message: "请先登录" }); return; }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/orders/${id}/vouchers`, method: "GET",
      header: { authorization: `Bearer ${token}` },
      success(response) {
        const result = response.data as { vouchers?: Voucher[] };
        if (response.statusCode !== 200 || !Array.isArray(result?.vouchers)) {
          page.setData({ message: "读取核销券失败" }); return;
        }
        page.setData({ vouchers: result.vouchers, message: result.vouchers.length ? "" : "支付确认后会在这里显示核销券" });
        result.vouchers.forEach((voucher, index) => {
          if (voucher.status !== "UNUSED") return;
          wx.downloadFile({
            url: `${API_BASE_URL}/api/orders/${id}/vouchers/${voucher.id}/qr`,
            header: { authorization: `Bearer ${token}` },
            success(file) {
              if (file.statusCode !== 200) return;
              const current = [...(page.data.vouchers as Voucher[])];
              current[index] = { ...current[index], qrPath: file.tempFilePath };
              page.setData({ vouchers: current });
            }, fail() {},
          });
        });
      }, fail() { page.setData({ message: "无法连接后端" }); },
    });
  },
});
