import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { createDatabasePool } from "../db/connection";

export class VoucherError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}

async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
}

export async function verifyVoucher(code: string, storeId: number, adminSessionId: number) {
  return inTransaction(async (connection) => {
    const [rows] = await connection.execute<(RowDataPacket & {
      id: number; store_id: number; status: string; valid_from: Date; valid_until: Date;
      order_status: string; product_name: string;
    })[]>(
      `SELECT v.id, v.store_id, v.status, v.valid_from, v.valid_until,
              o.status AS order_status, p.name AS product_name
      FROM vouchers v JOIN orders o ON o.id = v.order_id
       JOIN products p ON p.id = o.product_id WHERE v.code = ? OR v.voucher_no = ? FOR UPDATE`, [code, code]
    );
    if (!rows.length) throw new VoucherError(404, "voucher_not_found");
    const voucher = rows[0];
    if (voucher.store_id !== storeId) throw new VoucherError(409, "wrong_store");
    if (voucher.status !== "UNUSED" || voucher.order_status !== "PAID") {
      throw new VoucherError(409, "voucher_not_usable");
    }
    const now = Date.now();
    if (now < new Date(voucher.valid_from).getTime() || now >= new Date(voucher.valid_until).getTime()) {
      throw new VoucherError(409, "voucher_expired");
    }
    await connection.execute("UPDATE vouchers SET status = 'USED', used_at = UTC_TIMESTAMP(3) WHERE id = ?", [voucher.id]);
    await connection.execute(
      "INSERT INTO voucher_verifications (voucher_id, store_id, admin_session_id, action) VALUES (?, ?, ?, 'USE')",
      [voucher.id, storeId, adminSessionId]
    );
    return { voucherId: voucher.id, productName: voucher.product_name, status: "USED" };
  });
}

export async function reverseVerification(voucherId: number, storeId: number, adminSessionId: number, reason: string) {
  return inTransaction(async (connection) => {
    const [rows] = await connection.execute<(RowDataPacket & { store_id: number; status: string; order_status: string })[]>(
      `SELECT v.store_id, v.status, o.status AS order_status FROM vouchers v
       JOIN orders o ON o.id = v.order_id WHERE v.id = ? FOR UPDATE`, [voucherId]
    );
    if (!rows.length) throw new VoucherError(404, "voucher_not_found");
    if (rows[0].store_id !== storeId) throw new VoucherError(409, "wrong_store");
    if (rows[0].status !== "USED" || rows[0].order_status !== "PAID") {
      throw new VoucherError(409, "voucher_not_reversible");
    }
    await connection.execute("UPDATE vouchers SET status = 'UNUSED', used_at = NULL WHERE id = ?", [voucherId]);
    await connection.execute(
      "INSERT INTO voucher_verifications (voucher_id, store_id, admin_session_id, action, reason) VALUES (?, ?, ?, 'REVERSE', ?)",
      [voucherId, storeId, adminSessionId, reason]
    );
    return { voucherId, status: "UNUSED" };
  });
}
