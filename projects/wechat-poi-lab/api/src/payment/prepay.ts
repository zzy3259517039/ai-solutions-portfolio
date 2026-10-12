import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";
import { OrderError } from "../orders/service";
import { loadPaymentConfig, PaymentError, WechatPayClient } from "./client";

export async function preparePayment(userId: number, openid: string, orderId: number) {
  const config = loadPaymentConfig();
  const client = new WechatPayClient(config);
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute<(RowDataPacket & {
      order_no: string; amount: number; status: string; prepay_id: string | null;
      expires_at: Date; product_name: string;
    })[]>(
      `SELECT o.order_no, o.amount, o.status, o.prepay_id, o.expires_at,
              p.name AS product_name FROM orders o JOIN products p ON p.id = o.product_id
       WHERE o.id = ? AND o.user_id = ? FOR UPDATE`, [orderId, userId]
    );
    if (!orders.length) throw new OrderError(404, "order_not_found");
    const order = orders[0];
    if (order.status !== "PENDING") throw new OrderError(409, "order_not_pending");
    if (new Date(order.expires_at).getTime() <= Date.now()) throw new OrderError(409, "order_expired");
    const prepayId = order.prepay_id ?? await client.prepay({
      orderNo: order.order_no, amount: order.amount, description: order.product_name,
      openid, expiresAt: new Date(order.expires_at),
    });
    if (!order.prepay_id) {
      await connection.execute("UPDATE orders SET prepay_id = ? WHERE id = ?", [prepayId, orderId]);
    }
    await connection.commit();
    return { orderId, ...client.payParams(prepayId) };
  } catch (error) {
    await connection.rollback();
    if (error instanceof OrderError || error instanceof PaymentError) throw error;
    throw new PaymentError("payment_unavailable");
  } finally { connection.release(); await pool.end(); }
}
