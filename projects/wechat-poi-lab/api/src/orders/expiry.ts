import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";
import { loadPaymentConfig, PaymentError, WechatPayClient } from "../payment/client";
import { applyPaidTransaction } from "../payment/notification";

async function closeLocalOrder(orderId: number, expectedPrepayId: string | null): Promise<boolean> {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute<(RowDataPacket & {
      product_id: number; quantity: number; status: string; expires_at: Date; prepay_id: string | null;
    })[]>("SELECT product_id, quantity, status, expires_at, prepay_id FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!orders.length || orders[0].status !== "PENDING" ||
        orders[0].prepay_id !== expectedPrepayId || new Date(orders[0].expires_at).getTime() > Date.now()) {
      await connection.commit(); return false;
    }
    await connection.execute("UPDATE orders SET status = 'CLOSED' WHERE id = ?", [orderId]);
    await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [orders[0].quantity, orders[0].product_id]);
    await connection.commit();
    return true;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
}

export async function expireUnpaidOrders(limit = 20): Promise<{ closed: number; paid: number; skipped: number }> {
  const pool = createDatabasePool();
  let rows: (RowDataPacket & { id: number; order_no: string; prepay_id: string | null })[];
  try {
    [rows] = await pool.query<(RowDataPacket & { id: number; order_no: string; prepay_id: string | null })[]>(
      `SELECT id, order_no, prepay_id FROM orders
       WHERE status = 'PENDING' AND expires_at <= UTC_TIMESTAMP(3)
       ORDER BY id LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}`
    );
  } finally { await pool.end(); }
  let client: WechatPayClient | undefined;
  try { client = new WechatPayClient(loadPaymentConfig()); }
  catch (error) { if (!(error instanceof PaymentError)) throw error; }
  const count = { closed: 0, paid: 0, skipped: 0 };
  for (const order of rows) {
    try {
      if (order.prepay_id) {
        if (!client) { count.skipped += 1; continue; }
        const state = await client.queryOrder(order.order_no);
        if (state.trade_state === "SUCCESS") {
          await applyPaidTransaction(state, client.config);
          count.paid += 1;
          continue;
        }
        if (state.trade_state === "NOTPAY") await client.closeOrder(order.order_no);
        else if (state.trade_state !== "CLOSED") { count.skipped += 1; continue; }
      }
      if (await closeLocalOrder(order.id, order.prepay_id)) count.closed += 1;
    } catch { count.skipped += 1; }
  }
  return count;
}
