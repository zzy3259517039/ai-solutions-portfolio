import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";

const attempts = new Map<string, { count: number; until: number }>();

export async function adminLogin(request: Request, response: Response): Promise<void> {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || configured === "replace_with_local_admin_password") {
    response.status(503).json({ error: "admin_not_configured" });
    return;
  }
  const password = request.body?.password;
  const operatorName = request.body?.operatorName;
  if (typeof password !== "string" || password.length < 1 || password.length > 256 ||
      typeof operatorName !== "string" || !operatorName.trim() || operatorName.length > 80) {
    response.status(400).json({ error: "invalid_password" });
    return;
  }
  const ip = request.ip ?? "local";
  const current = attempts.get(ip);
  if (current && current.until > Date.now() && current.count >= 5) {
    response.status(429).json({ error: "too_many_attempts" });
    return;
  }

  const expected = createHash("sha256").update(configured).digest();
  const actual = createHash("sha256").update(password).digest();
  if (!timingSafeEqual(expected, actual)) {
    attempts.set(ip, {
      count: current && current.until > Date.now() ? current.count + 1 : 1,
      until: Date.now() + 15 * 60_000,
    });
    response.status(401).json({ error: "invalid_credentials" });
    return;
  }

  attempts.delete(ip);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60_000);
  const pool = createDatabasePool();
  try {
    await pool.execute(
      "INSERT INTO admin_sessions (token_hash, expires_at, operator_name) VALUES (?, ?, ?)",
      [tokenHash, expiresAt, operatorName.trim()]
    );
    response.json({ token, expiresAt: expiresAt.toISOString() });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally {
    await pool.end();
  }
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction): Promise<void> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.header("authorization") ?? "");
  if (!match) {
    response.status(401).json({ error: "admin_auth_required" });
    return;
  }
  const tokenHash = createHash("sha256").update(match[1]).digest();
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1",
      [tokenHash]
    );
    if (rows.length === 0) {
      response.status(401).json({ error: "admin_auth_required" });
      return;
    }
    (request as Request & { adminSessionId: number }).adminSessionId = Number(rows[0].id);
    next();
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally {
    await pool.end();
  }
}

export function authenticatedAdminSessionId(request: Request): number {
  const id = (request as Request & { adminSessionId?: number }).adminSessionId;
  if (!Number.isSafeInteger(id)) throw new Error("admin_auth_middleware_missing");
  return id!;
}
