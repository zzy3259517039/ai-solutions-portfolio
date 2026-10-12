import { createDecipheriv } from "node:crypto";
import type { Request } from "express";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";
import { loadPaymentConfig, PaymentError, WechatPayClient, type PaymentConfig } from "./client";
import { responseSignatureMessage, verifyRsaSha256 } from "./crypto";
import { issueVouchers } from "../vouchers/service";

type Resource = { algorithm?: string; nonce?: string; associated_data?: string; ciphertext?: string; original_type?: string };
type PaymentNotification = { event_type?: string; resource_type?: string; resource?: Resource };
export type PaidTransaction = {
  appid?: string; mchid?: string; out_trade_no?: string; transaction_id?: string;
  trade_state?: string; amount?: { total?: number; currency?: string };
  payer?: { openid?: string }; success_time?: string;
};

export function decodeNotification(request: Request, config: PaymentConfig, originalType: "transaction" | "refund") {
  if (!Buffer.isBuffer(request.body)) throw new PaymentError("invalid_notification");
  const raw = request.body.toString("utf8");
  const timestamp = request.header("wechatpay-timestamp") ?? "";
  const nonce = request.header("wechatpay-nonce") ?? "";
  const serial = request.header("wechatpay-serial") ?? "";
  const signature = request.header("wechatpay-signature") ?? "";
  const seconds = Number(timestamp);
  if (serial !== config.publicKeyId || !Number.isSafeInteger(seconds) ||
      Math.abs(Date.now() / 1000 - seconds) > 300 ||
      !verifyRsaSha256(responseSignatureMessage(timestamp, nonce, raw), signature, config.publicKey)) {
    throw new PaymentError("invalid_notification_signature");
  }
  let notification: PaymentNotification;
  try { notification = JSON.parse(raw) as PaymentNotification; }
  catch { throw new PaymentError("invalid_notification"); }
  if (!(originalType === "transaction" ? notification.event_type === "TRANSACTION.SUCCESS" :
      ["REFUND.SUCCESS", "REFUND.CLOSED", "REFUND.ABNORMAL"].includes(notification.event_type ?? "")) ||
      notification.resource_type !== "encrypt-resource" ||
      notification.resource?.algorithm !== "AEAD_AES_256_GCM" ||
      notification.resource.original_type !== originalType ||
      !notification.resource.nonce || !notification.resource.ciphertext) {
    throw new PaymentError("invalid_notification");
  }
  const resource = notification.resource;
  try {
    const encrypted = Buffer.from(resource.ciphertext!, "base64");
    if (encrypted.length < 17) throw new Error("short ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.apiV3Key, "utf8"), Buffer.from(resource.nonce!, "utf8"));
    decipher.setAAD(Buffer.from(resource.associated_data ?? "", "utf8"));
    decipher.setAuthTag(encrypted.subarray(-16));
    const clear = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
    return JSON.parse(clear.toString("utf8")) as unknown;
  } catch { throw new PaymentError("invalid_notification_resource"); }
}

export function verifyNotification(request: Request, config: PaymentConfig): PaidTransaction {
  return decodeNotification(request, config, "transaction") as PaidTransaction;
}

export async function applyPaidTransaction(transaction: PaidTransaction, config: PaymentConfig): Promise<void> {
  if (transaction.appid !== config.appId || transaction.mchid !== config.mchId ||
      transaction.trade_state !== "SUCCESS" || !transaction.out_trade_no ||
      !transaction.transaction_id || !Number.isSafeInteger(transaction.amount?.total) ||
      transaction.amount?.currency !== "CNY" || !transaction.payer?.openid ||
      !transaction.success_time || !Number.isFinite(Date.parse(transaction.success_time))) {
    throw new PaymentError("payment_mismatch");
  }
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & {
      id: number; amount: number; status: string; wechat_transaction_id: string | null; openid: string;
    })[]>(
      `SELECT o.id, o.amount, o.status, o.wechat_transaction_id, u.openid
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.order_no = ? FOR UPDATE`,
      [transaction.out_trade_no]
    );
    if (!rows.length || rows[0].amount !== transaction.amount?.total || rows[0].openid !== transaction.payer.openid) {
      throw new PaymentError("payment_mismatch");
    }
    const order = rows[0];
    if (order.status === "PAID" || order.status === "REFUNDING" || order.status === "REFUNDED") {
      if (order.wechat_transaction_id !== transaction.transaction_id) throw new PaymentError("payment_mismatch");
      if (order.status === "PAID") await issueVouchers(connection, order.id, new Date(transaction.success_time));
      await connection.commit(); return;
    }
    if (order.status !== "PENDING") throw new PaymentError("payment_mismatch");
    await connection.execute(
      "UPDATE orders SET status = 'PAID', wechat_transaction_id = ?, paid_at = ? WHERE id = ?",
      [transaction.transaction_id, new Date(transaction.success_time), order.id]
    );
    await issueVouchers(connection, order.id, new Date(transaction.success_time));
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error instanceof PaymentError) throw error;
    throw new PaymentError("payment_persist_failed");
  } finally { connection.release(); await pool.end(); }
}

export async function handlePaymentNotification(request: Request): Promise<void> {
  const config = loadPaymentConfig();
  const transaction = verifyNotification(request, config);
  await applyPaidTransaction(transaction, config);
}

export async function reconcileOrder(userId: number, orderId: number): Promise<string> {
  const config = loadPaymentConfig();
  const pool = createDatabasePool();
  let orderNo: string;
  try {
    const [rows] = await pool.execute<(RowDataPacket & { order_no: string; status: string })[]>(
      "SELECT order_no, status FROM orders WHERE id = ? AND user_id = ? LIMIT 1", [orderId, userId]
    );
    if (!rows.length) throw new PaymentError("order_not_found");
    if (rows[0].status !== "PENDING") return rows[0].status;
    orderNo = rows[0].order_no;
  } finally { await pool.end(); }
  const transaction = await new WechatPayClient(config).queryOrder(orderNo);
  if (transaction.trade_state === "SUCCESS") {
    await applyPaidTransaction(transaction, config);
    return "PAID";
  }
  return "PENDING";
}
