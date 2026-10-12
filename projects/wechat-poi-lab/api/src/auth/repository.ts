import { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { createDatabasePool } from "../db/connection";

export async function saveLogin(
  appId: string,
  openid: string,
  tokenHash: Buffer,
  expiresAt: Date
): Promise<void> {
  const pool = createDatabasePool();
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO users (appid, openid) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_login_at = UTC_TIMESTAMP(3)`,
      [appId, openid]
    );
    const [users] = await connection.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE appid = ? AND openid = ? FOR UPDATE",
      [appId, openid]
    );
    if (users.length !== 1) throw new Error("user_lookup_failed");
    await connection.execute(
      "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [users[0].id, tokenHash, expiresAt]
    );
    await connection.commit();
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    connection?.release();
    await pool.end();
  }
}
