import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createLogin } from "../src/auth/login";
import { exchangeWechatCode, WechatExchangeError } from "../src/auth/wechat";

test("code2session 仅向业务层返回 openid，不泄露 session_key", async () => {
  const fakeRequest = async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.weixin.qq.com");
    assert.equal(url.searchParams.get("appid"), "wx_test_app");
    assert.equal(url.searchParams.get("secret"), "test_secret");
    assert.equal(url.searchParams.get("js_code"), "one_time_code");
    return new Response(JSON.stringify({ openid: "o_test_user", session_key: "private_key" }));
  };

  const result = await exchangeWechatCode(
    "one_time_code", "wx_test_app", "test_secret", fakeRequest as typeof fetch
  );
  assert.deepEqual(result, { openid: "o_test_user" });
});

test("微信拒绝 code 时返回统一错误，不泄漏上游详情", async () => {
  const fakeRequest = async () => new Response(JSON.stringify({ errcode: 40029, errmsg: "secret detail" }));
  await assert.rejects(
    () => exchangeWechatCode("bad_code", "wx_test_app", "test_secret", fakeRequest as typeof fetch),
    (error: unknown) => error instanceof WechatExchangeError && !error.message.includes("secret detail")
  );
});

test("登录创建随机会话，数据库只保存令牌哈希", async () => {
  let savedHash: Buffer | undefined;
  const result = await createLogin("one_time_code", {
    appId: "wx_test_app",
    appSecret: "test_secret",
    exchangeCode: async () => ({ openid: "o_test_user" }),
    persist: async (appId, openid, tokenHash) => {
      assert.equal(appId, "wx_test_app");
      assert.equal(openid, "o_test_user");
      savedHash = tokenHash;
    },
  });

  assert.equal(result.openid, "o_test_user");
  assert.ok(result.token.length >= 40);
  assert.deepEqual(savedHash, createHash("sha256").update(result.token).digest());
  assert.ok(new Date(result.expiresAt).getTime() > Date.now());
});

test("没有真实小程序配置时不调用微信", async () => {
  let called = false;
  await assert.rejects(
    () => createLogin("code", {
      appId: "touristappid",
      appSecret: "",
      exchangeCode: async () => { called = true; return { openid: "fake" }; },
      persist: async () => { called = true; },
    }),
    /wechat_not_configured/
  );
  assert.equal(called, false);
});
