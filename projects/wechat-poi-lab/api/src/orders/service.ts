import { randomBytes } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createDatabasePool } from "../db/connection";

export class OrderError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}

function orderNo(): string {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `P${timestamp}${randomBytes(7).toString("hex")}`;
}

export async function createOrder(userId: number, productId: number, quantity: number) {
  const pool = createDatabasePool();
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [products] = await connection.execute<(RowDataPacket & {
      merchant_id: number; store_id: number; sale_price: number; stock: number;
    })[]>(
      `SELECT p.merchant_id, p.store_id, p.sale_price, p.stock
       FROM products p JOIN stores s ON s.id = p.store_id
       WHERE p.id = ? AND p.status = 'ACTIVE' AND s.status = 'ACTIVE' FOR UPDATE`,
      [productId]
    );
    if (products.length === 0) throw new OrderError(404, "product_not_found");
    const product = products[0];
    if (product.stock < quantity) throw new OrderError(409, "insufficient_stock");
    const amount = product.sale_price * quantity;
    if (!Number.isSafeInteger(amount) || amount > 4_294_967_295) throw new OrderError(400, "amount_out_of_range");
    await connection.execute("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId]);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const number = orderNo();
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO orders
       (order_no, user_id, merchant_id, store_id, product_id, quantity, amount, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [number, userId, product.merchant_id, product.store_id, productId, quantity, amount, expiresAt]
    );
    await connection.commit();
    return { id: insert.insertId, orderNo: number, amount, status: "PENDING", expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    connection?.release();
    await pool.end();
  }
}

export async function cancelOrder(userId: number, orderId: number) {
  const pool = createDatabasePool();
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [orders] = await connection.execute<(RowDataPacket & {
      product_id: number; quantity: number; status: string; prepay_id: string | null;
    })[]>(
      "SELECT product_id, quantity, status, prepay_id FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [orderId, userId]
    );
    if (orders.length === 0) throw new OrderError(404, "order_not_found");
    const order = orders[0];
    if (order.status !== "PENDING" || order.prepay_id !== null) {
      throw new OrderError(409, "order_cannot_cancel");
    }
    await connection.execute("UPDATE orders SET status = 'CLOSED' WHERE id = ?", [orderId]);
    await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [order.quantity, order.product_id]);
    await connection.commit();
    return { status: "CLOSED" };
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    connection?.release();
    await pool.end();
  }
}
