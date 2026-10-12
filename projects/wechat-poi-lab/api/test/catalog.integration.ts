import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { Server } from "node:http";
import type { RowDataPacket } from "mysql2";
import { createApp } from "../src/app";
import { createDatabasePool } from "../src/db/connection";

test("管理员建门店和商品后，公开目录按 store_id 展示", async () => {
  const pool = createDatabasePool();
  const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM merchants LIMIT 1");
  if (existing.length) {
    await pool.end();
    throw new Error("本集成测试只在空的实验数据库执行，避免触碰真实商家数据");
  }

  let server: Server | undefined;
  let merchantId: number | undefined;
  let storeId: number | undefined;
  let productId: number | undefined;
  let adminToken = "";
  try {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口获取失败");
    const base = `http://127.0.0.1:${address.port}`;

    async function post(path: string, body: object, token = "") {
      const response = await fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const result = await response.json() as Record<string, unknown>;
      assert.ok(response.ok, `${path} returned ${response.status}: ${JSON.stringify(result)}`);
      return result;
    }

    const login = await post("/api/admin/login", { password: process.env.ADMIN_PASSWORD, operatorName: "测试管理员" });
    adminToken = String(login.token);
    const merchant = await post("/api/admin/merchants", { name: "集成测试商家" }, adminToken);
    merchantId = Number(merchant.id);
    const store = await post("/api/admin/stores", { name: "集成测试门店", address: "测试地址" }, adminToken);
    storeId = Number(store.id);
    const product = await post("/api/admin/products", {
      storeId, name: "测试套餐", description: "仅用于自动测试",
      originalPrice: 6900, salePrice: 5990, stock: 10, validDays: 30, status: "ACTIVE",
    }, adminToken);
    productId = Number(product.id);

    const catalogResponse = await fetch(`${base}/api/stores/${storeId}/catalog`);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json() as { store: { name: string }; products: Array<{ id: number; sale_price: number }> };
    assert.equal(catalog.store.name, "集成测试门店");
    assert.equal(catalog.products.length, 1);
    assert.equal(catalog.products[0].id, productId);
    assert.equal(catalog.products[0].sale_price, 5990);
  } finally {
    if (productId) await pool.execute("DELETE FROM products WHERE id = ?", [productId]);
    if (storeId) await pool.execute("DELETE FROM stores WHERE id = ?", [storeId]);
    if (merchantId) await pool.execute("DELETE FROM merchants WHERE id = ?", [merchantId]);
    if (adminToken) {
      const hash = createHash("sha256").update(adminToken).digest();
      await pool.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [hash]);
    }
    await pool.end();
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});
