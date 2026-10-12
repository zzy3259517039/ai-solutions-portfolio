import { randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createDatabasePool } from "../db/connection";
import { loadPaymentConfig, PaymentError, WechatPayClient, type PaymentConfig } from "../payment/client";

export class RefundError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}

export type RefundResult = {
  out_refund_no?: string; refund_id?: string; transaction_id?: string; out_trade_no?: string;
  status?: string; refund_status?: string; mchid?: string;
  amount?: { total?: number; refund?: number; currency?: string };
  success_time?: string;
};

export async function requestRefund(userId: number, orderId: number, reason: string) {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute<(RowDataPacket & { status: string; amount: number })[]>(
      "SELECT status, amount FROM orders WHERE id = ? AND user_id = ? FOR UPDATE", [orderId, userId]
    );
    if (!orders.length) throw new RefundError(404, "order_not_found");
    if (orders[0].status !== "PAID") throw new RefundError(409, "order_not_refundable");
    const [used] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM vouchers WHERE order_id = ? AND (status <> 'UNUSED' OR valid_until <= UTC_TIMESTAMP(3)) LIMIT 1 FOR UPDATE", [orderId]
    );
    if (used.length) throw new RefundError(409, "voucher_not_refundable");
    const [existing] = await connection.execute<RowDataPacket[]>("SELECT id FROM refunds WHERE order_id = ?", [orderId]);
    if (existing.length) throw new RefundError(409, "refund_already_requested");
    const refundNo = `R${Date.now()}${randomBytes(7).toString("hex")}`;
    const [insert] = await connection.execute<ResultSetHeader>(
      "INSERT INTO refunds (order_id, out_refund_no, amount, reason) VALUES (?, ?, ?, ?)",
      [orderId, refundNo, orders[0].amount, reason]
    );
    await connection.commit();
    return { refundId: insert.insertId, status: "REQUESTED" };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
}

export async function applyRefundResult(result: RefundResult, config: PaymentConfig): Promise<string> {
  const status = result.status ?? result.refund_status;
  if (!result.out_refund_no || !["SUCCESS", "PROCESSING", "CLOSED", "ABNORMAL"].includes(status ?? "") ||
      (result.mchid && result.mchid !== config.mchId) || !result.transaction_id ||
      !Number.isSafeInteger(result.amount?.total) || !Number.isSafeInteger(result.amount?.refund)) {
    throw new RefundError(409, "refund_mismatch");
  }
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & {
      refund_id: number; order_id: number; amount: number; refund_status: string;
      order_status: string; order_no: string; wechat_transaction_id: string;
    })[]>(
      `SELECT r.id AS refund_id, r.order_id, r.amount, r.status AS refund_status,
              o.status AS order_status, o.order_no, o.wechat_transaction_id
       FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.out_refund_no = ? FOR UPDATE`,
      [result.out_refund_no]
    );
    if (!rows.length) throw new RefundError(404, "refund_not_found");
    const row = rows[0];
    if (row.amount !== result.amount?.total || row.amount !== result.amount?.refund ||
        row.wechat_transaction_id !== result.transaction_id ||
        (result.out_trade_no && row.order_no !== result.out_trade_no)) {
      throw new RefundError(409, "refund_mismatch");
    }
    if (["SUCCESS", "CLOSED"].includes(row.refund_status)) {
      if (status !== row.refund_status) throw new RefundError(409, "refund_state_conflict");
      await connection.commit(); return status!;
    }
    if (row.refund_status === "ABNORMAL" && status === "ABNORMAL") {
      await connection.commit(); return "ABNORMAL";
    }
    if (!["PROCESSING", "ABNORMAL"].includes(row.refund_status) || row.order_status !== "REFUNDING") {
      throw new RefundError(409, "refund_state_conflict");
    }
    if (status === "SUCCESS") {
      await connection.execute(
        "UPDATE refunds SET status = 'SUCCESS', wechat_refund_id = ?, completed_at = ? WHERE id = ?",
        [result.refund_id ?? null, result.success_time ? new Date(result.success_time) : new Date(), row.refund_id]
      );
      await connection.execute("UPDATE orders SET status = 'REFUNDED', refunded_at = UTC_TIMESTAMP(3) WHERE id = ?", [row.order_id]);
      await connection.execute("UPDATE vouchers SET status = 'REFUNDED' WHERE order_id = ? AND status = 'UNUSED'", [row.order_id]);
    } else if (status === "CLOSED") {
      await connection.execute("UPDATE refunds SET status = 'CLOSED' WHERE id = ?", [row.refund_id]);
      await connection.execute("UPDATE orders SET status = 'PAID' WHERE id = ?", [row.order_id]);
    } else {
      await connection.execute("UPDATE refunds SET status = ? WHERE id = ?", [status!, row.refund_id]);
    }
    await connection.commit();
    return status!;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
}

export async function submitRefund(refundId: number): Promise<{ status: string }> {
  const config = loadPaymentConfig();
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  let input: { transactionId: string; outRefundNo: string; reason: string; amount: number };
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & {
      order_id: number; refund_status: string; order_status: string; amount: number;
      reason: string; out_refund_no: string; wechat_transaction_id: string;
    })[]>(
      `SELECT r.order_id, r.status AS refund_status, o.status AS order_status,
              r.amount, r.reason, r.out_refund_no, o.wechat_transaction_id
       FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = ? FOR UPDATE`, [refundId]
    );
    if (!rows.length) throw new RefundError(404, "refund_not_found");
    const row = rows[0];
    if (!(["REQUESTED", "PROCESSING"].includes(row.refund_status)) ||
        !(["PAID", "REFUNDING"].includes(row.order_status)) || !row.wechat_transaction_id) {
      throw new RefundError(409, "refund_not_submittable");
    }
    if (row.refund_status === "REQUESTED") {
      const [used] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM vouchers WHERE order_id = ? AND (status <> 'UNUSED' OR valid_until <= UTC_TIMESTAMP(3)) LIMIT 1 FOR UPDATE", [row.order_id]
      );
      if (used.length) throw new RefundError(409, "voucher_not_refundable");
      await connection.execute("UPDATE orders SET status = 'REFUNDING' WHERE id = ?", [row.order_id]);
      await connection.execute("UPDATE refunds SET status = 'PROCESSING' WHERE id = ?", [refundId]);
    }
    input = { transactionId: row.wechat_transaction_id, outRefundNo: row.out_refund_no,
      reason: row.reason, amount: row.amount };
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
  const result = await new WechatPayClient(config).requestRefund(input);
  return { status: await applyRefundResult(result, config) };
}

export async function reconcileRefund(refundId: number): Promise<{ status: string }> {
  const config = loadPaymentConfig();
  const pool = createDatabasePool();
  let refundNo: string;
  try {
    const [rows] = await pool.execute<(RowDataPacket & { out_refund_no: string; status: string })[]>(
      "SELECT out_refund_no, status FROM refunds WHERE id = ?", [refundId]
    );
    if (!rows.length) throw new RefundError(404, "refund_not_found");
    if (rows[0].status === "REQUESTED" || rows[0].status === "SUCCESS" || rows[0].status === "CLOSED") {
      return { status: rows[0].status };
    }
    refundNo = rows[0].out_refund_no;
  } finally { await pool.end(); }
  const result = await new WechatPayClient(config).queryRefund(refundNo);
  return { status: await applyRefundResult(result, config) };
}
