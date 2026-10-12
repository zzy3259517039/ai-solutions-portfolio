import { API_BASE_URL } from "../../config";

type CatalogProduct = {
  id: number;
  name: string;
  description: string;
  original_price: number;
  sale_price: number;
  stock: number;
  valid_days: number;
};

Page({
  data: {
    storeName: "",
    address: "",
    products: [] as Array<CatalogProduct & { salePriceYuan: string; originalPriceYuan: string }>,
    message: "正在加载门店…",
  },

  onLoad(this: { setData(data: Record<string, unknown>): void }, options: { store_id?: string }) {
    const storeId = options.store_id ?? "";
    if (!/^\d+$/.test(storeId) || Number(storeId) < 1) {
      this.setData({ message: "缺少有效的 store_id 参数" });
      return;
    }
    const page = this;
    wx.request({
      url: `${API_BASE_URL}/api/stores/${storeId}/catalog`,
      method: "GET",
      success(response) {
        const payload = response.data as {
          store?: { name?: string; address?: string };
          products?: CatalogProduct[];
        } | null;
        if (response.statusCode !== 200 || !payload?.store || !Array.isArray(payload.products)) {
          page.setData({ message: "门店不存在或后端未就绪" });
          return;
        }
        const products = payload.products.map((product) => ({
          ...product,
          salePriceYuan: (product.sale_price / 100).toFixed(2),
          originalPriceYuan: (product.original_price / 100).toFixed(2),
        }));
        page.setData({
          storeName: payload.store.name ?? "",
          address: payload.store.address ?? "",
          products,
          message: products.length ? "" : "这家门店还没有上架商品",
        });
      },
      fail() { page.setData({ message: "无法连接后端，请检查本地调试设置" }); },
    });
  },

  onOpenProduct(event: { currentTarget: { dataset: { id: number } } }) {
    const id = Number(event.currentTarget.dataset.id);
    if (Number.isSafeInteger(id) && id > 0) {
      wx.navigateTo({ url: `/pages/product/detail?product_id=${id}` });
    }
  },
});
