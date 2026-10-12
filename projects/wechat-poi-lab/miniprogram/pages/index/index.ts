import { API_BASE_URL } from "../../config";

type LoginPage = {
  data: { loading: boolean; storeId: string };
  setData(data: Record<string, string | boolean>): void;
};

Page({
  data: {
    title: "微信 POI 接入实验室",
    subtitle: "门店团购与核销实验",
    loading: false,
    status: "点击按钮获取微信登录凭证",
    openid: "",
    storeId: "",
  },

  onStoreIdInput(this: LoginPage, event: { detail: { value: string } }) {
    this.setData({ storeId: event.detail.value });
  },

  onOpenStore(this: LoginPage) {
    if (!/^\d+$/.test(this.data.storeId) || Number(this.data.storeId) < 1) {
      this.setData({ status: "请输入有效的门店 ID" });
      return;
    }
    wx.navigateTo({ url: `/pages/groupbuy/index?store_id=${this.data.storeId}` });
  },

  onMyOrders() {
    wx.navigateTo({ url: "/pages/orders/index" });
  },

  onLoginTap(this: LoginPage) {
    if (this.data.loading) return;
    const page = this;
    page.setData({ loading: true, status: "正在请求微信登录…", openid: "" });

    wx.login({
      success(result) {
        if (!result.code) {
          page.setData({ loading: false, status: "微信没有返回登录凭证" });
          return;
        }

        wx.request({
          // 仅用于微信开发者工具本机调试。真机须改为已配置的 HTTPS 合法域名。
          url: `${API_BASE_URL}/api/auth/wechat-login`,
          method: "POST",
          header: { "content-type": "application/json" },
          data: { code: result.code },
          success(response) {
            const data = response.data as Record<string, unknown> | null;
            if (
              response.statusCode === 200 &&
              data &&
              typeof data.openid === "string" &&
              typeof data.token === "string"
            ) {
              wx.setStorageSync("poi_lab_session_token", data.token);
              page.setData({ loading: false, status: "微信登录成功", openid: data.openid });
              return;
            }
            const message = response.statusCode === 503
              ? "后端还没有配置真实小程序 AppID 和 Secret"
              : "登录失败，请检查后端和微信配置";
            page.setData({ loading: false, status: message });
          },
          fail() {
            page.setData({ loading: false, status: "无法连接本地后端，请检查开发者工具网络设置" });
          },
        });
      },
      fail() {
        page.setData({ loading: false, status: "wx.login 调用失败，请检查小程序 AppID" });
      },
    });
  },
});
