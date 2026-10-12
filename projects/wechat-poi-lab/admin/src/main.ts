import "./style.css";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`管理后台元素缺失: ${selector}`);
  return element;
}

const apiStatus = requiredElement<HTMLElement>("#api-status");
const dbStatus = requiredElement<HTMLElement>("#db-status");
const refreshButton = requiredElement<HTMLButtonElement>("#refresh");
const loginForm = requiredElement<HTMLFormElement>("#login-form");
const merchantForm = requiredElement<HTMLFormElement>("#merchant-form");
const merchantProfileForm = requiredElement<HTMLFormElement>("#merchant-profile-form");
const storeForm = requiredElement<HTMLFormElement>("#store-form");
const productForm = requiredElement<HTMLFormElement>("#product-form");
const adminPanel = requiredElement<HTMLElement>("#admin-panel");
const adminMessage = requiredElement<HTMLElement>("#admin-message");
const catalogList = requiredElement<HTMLElement>("#catalog-list");
const storeSelect = requiredElement<HTMLSelectElement>("#store-select");
const verifyStoreSelect = requiredElement<HTMLSelectElement>("#verify-store-select");
const reverseStoreSelect = requiredElement<HTMLSelectElement>("#reverse-store-select");
const verifyForm = requiredElement<HTMLFormElement>("#verify-form");
const reverseForm = requiredElement<HTMLFormElement>("#reverse-form");
const verificationRefresh = requiredElement<HTMLButtonElement>("#verification-refresh");
const verificationList = requiredElement<HTMLElement>("#verification-list");
const refundRefresh = requiredElement<HTMLButtonElement>("#refund-refresh");
const refundList = requiredElement<HTMLElement>("#refund-list");
const experimentSettingsForm = requiredElement<HTMLFormElement>("#experiment-settings-form");
const experimentStoreSelect = requiredElement<HTMLSelectElement>("#experiment-store-select");
const experimentPath = requiredElement<HTMLElement>("#experiment-path");
const experimentRefresh = requiredElement<HTMLButtonElement>("#experiment-refresh");
const experimentGroups = requiredElement<HTMLElement>("#experiment-groups");

type Entity = { id: number; name: string };
type Merchant = Entity & { credit_code: string; legal_representative: string; contact_phone: string;
  industry: string; wechat_appid: string; wechat_mchid: string };
type Store = Entity & { address: string; status: string };
type Product = Entity & { store_id: number; sale_price: number; stock: number; status: string };
type Catalog = { merchants: Merchant[]; stores: Store[]; products: Product[] };

let adminToken = sessionStorage.getItem("poi_lab_admin_token") ?? "";
let currentMerchantId = 0;

async function getStatus(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function refresh() {
  apiStatus.textContent = "检查中…";
  dbStatus.textContent = "检查中…";
  const [apiReady, dbReady] = await Promise.all([
    getStatus("/api/health"),
    getStatus("/api/ready"),
  ]);
  apiStatus.textContent = apiReady ? "运行正常" : "未连接";
  dbStatus.textContent = dbReady ? "已连接" : "未连接";
  apiStatus.dataset.state = apiReady ? "ok" : "error";
  dbStatus.dataset.state = dbReady ? "ok" : "error";
}

refreshButton.addEventListener("click", refresh);
void refresh();

async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = result as { error?: string };
    if (response.status === 401 && path !== "/api/admin/login") {
      adminToken = "";
      sessionStorage.removeItem("poi_lab_admin_token");
      adminPanel.hidden = true;
      loginForm.hidden = false;
    }
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  return result as T;
}

function value(form: HTMLFormElement, key: string): string {
  return String(new FormData(form).get(key) ?? "").trim();
}

function yuanToFen(amount: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) throw new Error("金额请输入元，最多两位小数");
  const [yuan, cents = ""] = amount.split(".");
  return Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
}

function showMessage(message: string) {
  adminMessage.textContent = message;
}

async function loadCatalog() {
  const catalog = await api<Catalog>("/api/admin/catalog");
  merchantForm.hidden = catalog.merchants.length > 0;
  merchantProfileForm.hidden = catalog.merchants.length === 0;
  const merchant = catalog.merchants[0];
  if (merchant) {
    currentMerchantId = merchant.id;
    const fields = { name: merchant.name, creditCode: merchant.credit_code,
      legalRepresentative: merchant.legal_representative, contactPhone: merchant.contact_phone,
      industry: merchant.industry, wechatAppid: merchant.wechat_appid, wechatMchid: merchant.wechat_mchid };
    for (const [key, text] of Object.entries(fields)) {
      const input = merchantProfileForm.elements.namedItem(key) as HTMLInputElement | null;
      if (input) input.value = text ?? "";
    }
  }
  storeSelect.replaceChildren(new Option("选择门店", ""));
  verifyStoreSelect.replaceChildren(new Option("选择核销门店", ""));
  reverseStoreSelect.replaceChildren(new Option("选择原核销门店", ""));
  experimentStoreSelect.replaceChildren(new Option("选择本次实验门店", ""));
  for (const store of catalog.stores) {
    storeSelect.add(new Option(`${store.name}（ID ${store.id}）`, String(store.id)));
    verifyStoreSelect.add(new Option(`${store.name}（ID ${store.id}）`, String(store.id)));
    reverseStoreSelect.add(new Option(`${store.name}（ID ${store.id}）`, String(store.id)));
    experimentStoreSelect.add(new Option(`${store.name}（ID ${store.id}）`, String(store.id)));
  }
  catalogList.replaceChildren();
  for (const merchant of catalog.merchants) {
    const row = document.createElement("div");
    row.textContent = `商家：${merchant.name}（ID ${merchant.id}）`;
    catalogList.append(row);
  }
  for (const store of catalog.stores) {
    const row = document.createElement("div");
    row.textContent = `门店：${store.name} · ${store.address} · 测试路径 /pages/groupbuy/index?store_id=${store.id}`;
    catalogList.append(row);
  }
  for (const product of catalog.products) {
    const row = document.createElement("div");
    row.textContent = `商品：${product.name} · ¥${(product.sale_price / 100).toFixed(2)} · 库存 ${product.stock} · ${product.status}`;
    catalogList.append(row);
  }
  if (!catalog.merchants.length && !catalog.stores.length && !catalog.products.length) {
    catalogList.textContent = "还没有商家、门店或商品。";
  }
}

async function activateAdmin() {
  adminPanel.hidden = false;
  loginForm.hidden = true;
  await loadCatalog();
  await Promise.all([loadRefunds(), loadExperiments()]);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api<{ token: string }>("/api/admin/login", "POST", {
      password: value(loginForm, "password"), operatorName: value(loginForm, "operatorName"),
    });
    adminToken = result.token;
    sessionStorage.setItem("poi_lab_admin_token", adminToken);
    loginForm.reset();
    await activateAdmin();
    showMessage("后台登录成功");
  } catch (error) { showMessage(`登录失败：${String(error)}`); }
});

merchantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/merchants", "POST", { name: value(merchantForm, "name") });
    merchantForm.reset();
    await loadCatalog();
    showMessage("商家创建成功");
  } catch (error) { showMessage(`创建失败：${String(error)}`); }
});

merchantProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentMerchantId) return;
  try {
    await api(`/api/admin/merchants/${currentMerchantId}/profile`, "PUT", {
      name: value(merchantProfileForm, "name"), creditCode: value(merchantProfileForm, "creditCode"),
      legalRepresentative: value(merchantProfileForm, "legalRepresentative"),
      contactPhone: value(merchantProfileForm, "contactPhone"), industry: value(merchantProfileForm, "industry"),
      wechatAppid: value(merchantProfileForm, "wechatAppid"), wechatMchid: value(merchantProfileForm, "wechatMchid"),
    });
    await loadCatalog();
    showMessage("商家资料已保存。AppSecret 和支付密钥只保存在服务端环境配置。 ");
  } catch (error) { showMessage(`保存商家资料失败：${String(error)}`); }
});

storeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/stores", "POST", {
      name: value(storeForm, "name"), address: value(storeForm, "address"),
    });
    storeForm.reset();
    await loadCatalog();
    showMessage("门店创建成功");
  } catch (error) { showMessage(`创建失败：${String(error)}`); }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/products", "POST", {
      storeId: Number(value(productForm, "storeId")),
      name: value(productForm, "name"),
      description: value(productForm, "description"),
      originalPrice: yuanToFen(value(productForm, "originalPrice")),
      salePrice: yuanToFen(value(productForm, "salePrice")),
      stock: Number(value(productForm, "stock")),
      validDays: Number(value(productForm, "validDays")),
      status: value(productForm, "status"),
    });
    productForm.reset();
    await loadCatalog();
    showMessage("商品创建成功");
  } catch (error) { showMessage(`创建失败：${String(error)}`); }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api<{ voucherId: number; productName: string }>(
      "/api/admin/vouchers/verify", "POST", {
        storeId: Number(value(verifyForm, "storeId")), code: value(verifyForm, "code"),
      }
    );
    verifyForm.reset();
    showMessage(`核销成功：${result.productName}，券 ID ${result.voucherId}`);
  } catch (error) { showMessage(`核销失败：${String(error)}`); }
});

reverseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const voucherId = Number(value(reverseForm, "voucherId"));
    await api(`/api/admin/vouchers/${voucherId}/reverse`, "POST", {
      storeId: Number(value(reverseForm, "storeId")), reason: value(reverseForm, "reason"),
    });
    reverseForm.reset();
    showMessage(`已撤销券 ${voucherId} 的核销`);
  } catch (error) { showMessage(`撤销失败：${String(error)}`); }
});

async function loadVerificationLogs() {
  const data = await api<{ logs: {
    voucher_no: string; store_name: string; operator_name: string;
    action: string; reason: string | null; created_at: string;
  }[] }>("/api/admin/vouchers/verifications");
  verificationList.replaceChildren();
  if (!data.logs.length) { verificationList.textContent = "暂无核销记录"; return; }
  for (const log of data.logs) {
    const row = document.createElement("div");
    row.textContent = `${log.created_at} · ${log.action === "USE" ? "核销" : "撤销"} · 券 ${log.voucher_no} · ${log.store_name} · 操作人 ${log.operator_name}${log.reason ? ` · ${log.reason}` : ""}`;
    verificationList.append(row);
  }
}

verificationRefresh.addEventListener("click", () => void loadVerificationLogs().catch((error) => showMessage(`读取核销记录失败：${String(error)}`)));

type Refund = { id: number; order_no: string; amount: number; reason: string; status: string };
async function loadRefunds() {
  const data = await api<{ refunds: Refund[] }>("/api/admin/refunds");
  refundList.replaceChildren();
  if (!data.refunds.length) { refundList.textContent = "暂无退款申请"; return; }
  for (const refund of data.refunds) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = `订单 ${refund.order_no} · ¥${(refund.amount / 100).toFixed(2)} · ${refund.reason} · ${refund.status} `;
    row.append(label);
    if (refund.status === "REQUESTED" || refund.status === "PROCESSING") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = refund.status === "REQUESTED" ? "提交微信退款" : "查询退款结果";
      button.addEventListener("click", async () => {
        try {
          const action = refund.status === "REQUESTED" ? "submit" : "reconcile";
          const result = await api<{ status: string }>(`/api/admin/refunds/${refund.id}/${action}`, "POST");
          showMessage(`退款 ${refund.id} 当前状态：${result.status}`);
          await loadRefunds();
        } catch (error) { showMessage(`退款操作失败：${String(error)}`); }
      });
      row.append(button);
    }
    refundList.append(row);
  }
}

refundRefresh.addEventListener("click", () => void loadRefunds().catch((error) => showMessage(`读取退款失败：${String(error)}`)));

type StepRecord = { step_key: string; status: string; note: string | null; has_screenshot: number; completed_at: string | null };
type ExperimentData = {
  groups: { phase: number; title: string; steps: readonly (readonly [string, string])[] }[];
  steps: StepRecord[];
  settings: {
    store_id: number; poi_name: string; poi_address: string; poi_status: string;
    location_entry: string; service_name: string; review_status: string;
    merchant_confirmed_at: string | null; mini_path: string; path_params: string;
  } | null;
};

async function loadExperiments() {
  const data = await api<ExperimentData>("/api/admin/experiments");
  const settings = data.settings;
  if (settings) {
    const set = (name: string, text: string) => {
      const field = experimentSettingsForm.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (field) field.value = text;
    };
    set("storeId", String(settings.store_id));
    set("poiName", settings.poi_name);
    set("poiAddress", settings.poi_address);
    set("poiStatus", settings.poi_status);
    set("locationEntry", settings.location_entry);
    set("serviceName", settings.service_name);
    set("reviewStatus", settings.review_status);
    (experimentSettingsForm.elements.namedItem("merchantConfirmed") as HTMLInputElement).checked = !!settings.merchant_confirmed_at;
    experimentPath.textContent = `小程序 Path：${settings.mini_path} · 参数：${settings.path_params}`;
  }
  const recordMap = new Map(data.steps.map((step) => [step.step_key, step]));
  experimentGroups.replaceChildren();
  for (const group of data.groups) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = `Phase ${group.phase} · ${group.title}`;
    section.append(heading);
    for (const [key, label] of group.steps) {
      const saved = recordMap.get(key);
      const row = document.createElement("div");
      row.className = "experiment-step";
      const title = document.createElement("strong");
      title.textContent = label;
      const select = document.createElement("select");
      for (const [status, text] of [["TODO", "待做"], ["IN_PROGRESS", "进行中"], ["DONE", "已完成"], ["BLOCKED", "受阻"]]) {
        select.add(new Option(text, status));
      }
      select.value = saved?.status ?? "TODO";
      const note = document.createElement("textarea");
      note.placeholder = "记录官方后台看到的结果、受阻原因或验收备注";
      note.maxLength = 2000;
      note.value = saved?.note ?? "";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "保存步骤";
      save.addEventListener("click", async () => {
        try {
          await api(`/api/admin/experiments/steps/${key}`, "PUT", { status: select.value, note: note.value });
          showMessage(`${label} 已保存`);
        } catch (error) { showMessage(`保存失败：${String(error)}`); }
      });
      const evidence = document.createElement("input");
      evidence.type = "file";
      evidence.accept = "image/png,image/jpeg,image/webp";
      evidence.addEventListener("change", async () => {
        const file = evidence.files?.[0];
        if (!file) return;
        if (file.size > 2_000_000) { showMessage("截图不能超过 2 MB"); return; }
        try {
          const response = await fetch(`/api/admin/experiments/steps/${key}/screenshot`, {
            method: "PUT", headers: { authorization: `Bearer ${adminToken}`, "content-type": file.type }, body: file,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          showMessage(`${label} 截图已保存。上传前请遮盖密钥和个人敏感信息。`);
        } catch (error) { showMessage(`上传截图失败：${String(error)}`); }
      });
      row.append(title, select, note, save, evidence);
      if (saved?.has_screenshot) {
        const view = document.createElement("button");
        view.type = "button";
        view.textContent = "查看截图";
        view.addEventListener("click", async () => {
          const response = await fetch(`/api/admin/experiments/steps/${key}/screenshot`, {
            headers: { authorization: `Bearer ${adminToken}` },
          });
          if (!response.ok) { showMessage("读取截图失败"); return; }
          const url = URL.createObjectURL(await response.blob());
          const image = document.createElement("img");
          image.src = url;
          image.alt = `${label} 截图`;
          image.className = "evidence-preview";
          row.append(image);
        });
        row.append(view);
      }
      section.append(row);
    }
    experimentGroups.append(section);
  }
}

experimentSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api<{ miniPath: string; params: string }>("/api/admin/experiments/settings", "PUT", {
      storeId: Number(value(experimentSettingsForm, "storeId")),
      poiName: value(experimentSettingsForm, "poiName"),
      poiAddress: value(experimentSettingsForm, "poiAddress"),
      poiStatus: value(experimentSettingsForm, "poiStatus"),
      locationEntry: value(experimentSettingsForm, "locationEntry"),
      serviceName: value(experimentSettingsForm, "serviceName"),
      reviewStatus: value(experimentSettingsForm, "reviewStatus"),
      merchantConfirmed: (experimentSettingsForm.elements.namedItem("merchantConfirmed") as HTMLInputElement).checked,
    });
    experimentPath.textContent = `小程序 Path：${result.miniPath} · 参数：${result.params}`;
    showMessage("POI 与位置服务资料已保存");
  } catch (error) { showMessage(`保存失败：${String(error)}`); }
});

experimentRefresh.addEventListener("click", () => void loadExperiments().catch((error) => showMessage(`读取清单失败：${String(error)}`)));

if (adminToken) void activateAdmin().catch((error) => showMessage(`读取后台失败：${String(error)}`));
