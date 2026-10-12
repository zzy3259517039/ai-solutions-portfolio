import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { Server } from "node:http";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { createApp } from "../src/app";
import { createDatabasePool } from "../src/db/connection";

test("实验助手记录状态、Path、备注和截图，不自动标记官方审核", async () => {
  const pool = createDatabasePool();
  const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM merchants LIMIT 1");
  if (existing.length) { await pool.end(); throw new Error("实验集成测试只在空实验数据库执行"); }
  const token = randomBytes(32).toString("base64url");
  let merchantId = 0, storeId = 0, sessionId = 0;
  let server: Server | undefined;
  try {
    const [merchant] = await pool.execute<ResultSetHeader>("INSERT INTO merchants (name) VALUES ('实验测试商家')");
    merchantId = merchant.insertId;
    const [store] = await pool.execute<ResultSetHeader>(
      "INSERT INTO stores (merchant_id, name, address) VALUES (?, '实验门店', '测试地址')", [merchantId]
    );
    storeId = store.insertId;
    const [session] = await pool.execute<ResultSetHeader>(
      "INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)",
      [createHash("sha256").update(token).digest(), new Date(Date.now() + 60_000)]
    );
    sessionId = session.insertId;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试端口获取失败");
    const base = `http://127.0.0.1:${address.port}/api/admin/experiments`;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const initial = await fetch(base, { headers });
    assert.equal(initial.status, 200);
    const data = await initial.json() as { steps: unknown[]; groups: unknown[] };
    assert.equal(data.steps.length, 0);
    assert.ok(data.groups.length > 4);
    const settings = await fetch(`${base}/settings`, { method: "PUT", headers, body: JSON.stringify({
      storeId, poiName: "实验门店", poiAddress: "测试地址", poiStatus: "BLOCKED",
      locationEntry: "", serviceName: "团购", reviewStatus: "BLOCKED", merchantConfirmed: false,
    }) });
    assert.equal(settings.status, 200);
    assert.deepEqual(await settings.json(), {
      miniPath: `/pages/groupbuy/index?store_id=${storeId}`, params: JSON.stringify({ store_id: storeId }),
    });
    const step = await fetch(`${base}/steps/poi_permission`, {
      method: "PUT", headers,
      body: JSON.stringify({ status: "BLOCKED", note: "账号当前无位置服务权限" }),
    });
    assert.equal(step.status, 200);
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=", "base64");
    const upload = await fetch(`${base}/steps/poi_permission/screenshot`, {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "image/png" }, body: tinyPng,
    });
    assert.equal(upload.status, 200);
    const read = await fetch(`${base}/steps/poi_permission/screenshot`, { headers });
    assert.equal(read.status, 200);
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), tinyPng);
    const final = await fetch(base, { headers });
    const recorded = await final.json() as { steps: { step_key: string; status: string; has_screenshot: number }[] };
    assert.equal(recorded.steps.find((row) => row.step_key === "poi_permission")?.status, "BLOCKED");
    assert.equal(recorded.steps.find((row) => row.step_key === "poi_permission")?.has_screenshot, 1);
  } finally {
    await pool.execute("DELETE FROM experiment_steps WHERE step_key = 'poi_permission'");
    await pool.execute("DELETE FROM experiment_settings WHERE id = 1");
    if (sessionId) await pool.execute("DELETE FROM admin_sessions WHERE id = ?", [sessionId]);
    if (storeId) await pool.execute("DELETE FROM stores WHERE id = ?", [storeId]);
    if (merchantId) await pool.execute("DELETE FROM merchants WHERE id = ?", [merchantId]);
    await pool.end();
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});
