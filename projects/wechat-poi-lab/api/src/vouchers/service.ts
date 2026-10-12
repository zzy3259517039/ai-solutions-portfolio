import { randomBytes } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export async function issueVouchers(connection: PoolConnection, orderId: number, paidAt: Date): Promise<void> {
  const [orders] = await connection.execute<(RowDataPacket & {
    merchant_id: number; store_id: number; quantity: number; valid_days: number;
  })[]>(
    `SELECT o.merchant_id, o.store_id, o.quantity, p.valid_days
     FROM orders o JOIN products p ON p.id = o.product_id WHERE o.id = ?`, [orderId]
  );
  if (!orders.length) throw new Error("voucher_order_missing");
  const order = orders[0];
  const validUntil = new Date(paidAt.getTime() + order.valid_days * 86_400_000);
  const [existing] = await connection.execute<(RowDataPacket & { sequence_no: number })[]>(
    "SELECT sequence_no FROM vouchers WHERE order_id = ?", [orderId]
  );
  const present = new Set(existing.map((row) => row.sequence_no));
  for (let sequence = 1; sequence <= order.quantity; sequence += 1) {
    if (present.has(sequence)) continue;
    const voucherNo = (BigInt(`0x${randomBytes(6).toString("hex")}`) % 10_000_000_000n).toString().padStart(10, "0");
    await connection.execute(
      `INSERT INTO vouchers (order_id, merchant_id, store_id, sequence_no, voucher_no, code, valid_from, valid_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, order.merchant_id, order.store_id, sequence, voucherNo,
        randomBytes(16).toString("hex"), paidAt, validUntil]
    );
  }
}
