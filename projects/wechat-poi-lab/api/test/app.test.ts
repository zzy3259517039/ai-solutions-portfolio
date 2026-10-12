import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/app";

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp({ databaseCheck: async () => {} }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试端口获取失败");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("健康检查仅说明 API 已启动", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok", implementationPhase: 12, realFlowVerified: false, service: "api",
  });
});

test("就绪检查在数据库可用时返回成功", async () => {
  const response = await fetch(`${baseUrl}/api/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "connected" });
});

test("就绪检查可以反映数据库断开", async () => {
  const failedServer = createApp({ databaseCheck: async () => {
    throw new Error("database down");
  } }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => failedServer.once("listening", resolve));
  try {
    const address = failedServer.address();
    if (!address || typeof address === "string") throw new Error("测试端口获取失败");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unavailable",
      database: "disconnected",
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      failedServer.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("拒绝缺失的微信临时 code", async () => {
  const response = await fetch(`${baseUrl}/api/auth/wechat-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_code" });
});
