import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";

export type UserRequest = Request & { userId: number; userOpenid: string };

export function authenticatedUserId(request: Request): number {
  const id = (request as Request & { userId?: number }).userId;
  if (typeof id !== "number") throw new Error("user_auth_middleware_missing");
  return id;
}

export function authenticatedOpenid(request: Request): string {
  const openid = (request as Request & { userOpenid?: string }).userOpenid;
  if (typeof openid !== "string") throw new Error("user_auth_middleware_missing");
  return openid;
}

export async function requireUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  const appId = process.env.WECHAT_APPID;
  if (!appId || appId === "touristappid") {
    response.status(503).json({ error: "wechat_not_configured" });
    return;
  }
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.header("authorization") ?? "");
  if (!match) { response.status(401).json({ error: "login_required" }); return; }
  const hash = createHash("sha256").update(match[1]).digest();
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<(RowDataPacket & { id: number; openid: string })[]>(
      `SELECT u.id, u.openid FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.appid = ? LIMIT 1`,
      [hash, appId]
    );
    if (rows.length === 0) { response.status(401).json({ error: "login_required" }); return; }
    (request as UserRequest).userId = rows[0].id;
    (request as UserRequest).userOpenid = rows[0].openid;
    next();
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
}
