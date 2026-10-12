import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { Server } from "node:http";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createApp } from "../src/app";
import { saveLogin } from "../src/auth/repository";
import { createDatabasePool } from "../src/db/connection";
import { expireUnpaidOrders } from "../src/orders/expiry";

test("创建订单按服务端价格计费、预留库存，取消后归还", async () => {
  const pool = createDatabasePool();
  const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM merchants LIMIT 1");
  if (existing.length) { await pool.end(); throw new Error("订单集成测试只在空实验数据库执行"); }

  const originalAppId = process.env.WECHAT_APPID;
  const appId = `wx_order_test_${randomBytes(4).toString("hex")}`;
  const openid = `test_${randomBytes(8).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest();
  let server: Server | undefined;
  let userId: number | undefined;
  let merchantId: number | undefined;
  let storeId: number | undefined;
  let productId: number | undefined;
  let orderId: number | undefined;
  let expiredOrderId: number | undefined;
  try {
    process.env.WECHAT_APPID = appId;
    await saveLogin(appId, openid, hash, new Date(Date.now() + 60_000));
    const [users] = await pool.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE appid = ? AND openid = ?", [appId, openid]
    );
    userId = users[0].id;
    const [merchant] = await pool.execute<ResultSetHeader>(
      "INSERT INTO merchants (name) VALUES ('订单测试商家')"
    );
    merchantId = merchant.insertId;
    const [store] = await pool.execute<ResultSetHeader>(
      "INSERT INTO stores (merchant_id, name, address) VALUES (?, '订单测试门店', '测试地址')", [merchantId]
    );
    storeId = store.insertId;
    const [product] = await pool.execute<ResultSetHeader>(
      `INSERT INTO products
       (merchant_id, store_id, name, description, original_price, sale_price, stock, valid_days, status)
       VALUES (?, ?, '订单测试套餐', '', 6900, 5990, 5, 30, 'ACTIVE')`,
      [merchantId, storeId]
    );
    productId = product.insertId;

    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口获取失败");
    const base = `http://127.0.0.1:${address.port}`;
    const auth = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const created = await fetch(base + "/api/orders", {
      method: "POST", headers: auth,
      body: JSON.stringify({ productId, quantity: 2, amount: 1 }),
    });
    assert.equal(created.status, 201);
    const createdOrder = await created.json() as { id: number; amount: number; status: string };
    orderId = createdOrder.id;
    assert.equal(createdOrder.amount, 11980);
    assert.equal(createdOrder.status, "PENDING");
    const listed = await fetch(base + "/api/orders", { headers: auth });
    assert.equal(listed.status, 200);
    const list = await listed.json() as { orders: { id: number; display_status: string }[] };
    assert.equal(list.orders[0].id, orderId);
    assert.equal(list.orders[0].display_status, "PENDING");
    const [afterCreate] = await pool.execute<(RowDataPacket & { stock: number })[]>(
      "SELECT stock FROM products WHERE id = ?", [productId]
    );
    assert.equal(afterCreate[0].stock, 3);

    const cancelled = await fetch(`${base}/api/orders/${orderId}/cancel`, {
      method: "POST", headers: auth,
    });
    assert.equal(cancelled.status, 200);
    const [afterCancel] = await pool.execute<(RowDataPacket & { stock: number })[]>(
      "SELECT stock FROM products WHERE id = ?", [productId]
    );
    assert.equal(afterCancel[0].stock, 5);
    const again = await fetch(`${base}/api/orders/${orderId}/cancel`, {
      method: "POST", headers: auth,
    });
    assert.equal(again.status, 409);
    const toExpire = await fetch(base + "/api/orders", {
      method: "POST", headers: auth, body: JSON.stringify({ productId, quantity: 1 }),
    });
    assert.equal(toExpire.status, 201);
    expiredOrderId = (await toExpire.json() as { id: number }).id;
    await pool.execute("UPDATE orders SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?", [expiredOrderId]);
    const sweep = await expireUnpaidOrders();
    assert.ok(sweep.closed >= 1);
    const [expired] = await pool.execute<(RowDataPacket & { status: string })[]>(
      "SELECT status FROM orders WHERE id = ?", [expiredOrderId]
    );
    assert.equal(expired[0].status, "CLOSED");
    const [afterExpiry] = await pool.execute<(RowDataPacket & { stock: number })[]>(
      "SELECT stock FROM products WHERE id = ?", [productId]
    );
    assert.equal(afterExpiry[0].stock, 5);
  } finally {
    if (expiredOrderId) await pool.execute("DELETE FROM orders WHERE id = ?", [expiredOrderId]);
    if (orderId) await pool.execute("DELETE FROM orders WHERE id = ?", [orderId]);
    if (productId) await pool.execute("DELETE FROM products WHERE id = ?", [productId]);
    if (storeId) await pool.execute("DELETE FROM stores WHERE id = ?", [storeId]);
    if (merchantId) await pool.execute("DELETE FROM merchants WHERE id = ?", [merchantId]);
    if (userId) {
      await pool.execute("DELETE FROM user_sessions WHERE user_id = ?", [userId]);
      await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    }
    await pool.end();
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (originalAppId === undefined) delete process.env.WECHAT_APPID;
    else process.env.WECHAT_APPID = originalAppId;
  }
});
