import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2";
import { saveLogin } from "../src/auth/repository";
import { createDatabasePool } from "../src/db/connection";

test("真实 MySQL 能保存用户与令牌哈希，并清理测试数据", async () => {
  const appId = `wx_phase2_test_${randomBytes(6).toString("hex")}`;
  const openid = `test_${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest();
  const pool = createDatabasePool();

  try {
    await saveLogin(appId, openid, tokenHash, new Date(Date.now() + 60_000));
    const [users] = await pool.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE appid = ? AND openid = ?",
      [appId, openid]
    );
    assert.equal(users.length, 1);
    const [sessions] = await pool.execute<(RowDataPacket & { token_hash: Buffer })[]>(
      "SELECT token_hash FROM user_sessions WHERE user_id = ?",
      [users[0].id]
    );
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].token_hash, tokenHash);
  } finally {
    const [users] = await pool.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE appid = ? AND openid = ?",
      [appId, openid]
    );
    for (const user of users) {
      await pool.execute("DELETE FROM user_sessions WHERE user_id = ?", [user.id]);
      await pool.execute("DELETE FROM users WHERE id = ?", [user.id]);
    }
    await pool.end();
  }
});
