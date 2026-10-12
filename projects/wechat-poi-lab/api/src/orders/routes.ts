import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { authenticatedOpenid, authenticatedUserId, requireUser } from "../auth/user";
import { createDatabasePool } from "../db/connection";
import { parseId } from "../catalog/validation";
import { cancelOrder, createOrder, OrderError } from "./service";
import { preparePayment } from "../payment/prepay";
import { PaymentError } from "../payment/client";
import { reconcileOrder } from "../payment/notification";
import QRCode from "qrcode";
import { requestRefund, RefundError } from "../refunds/service";

export const ordersRouter = Router();
ordersRouter.use(requireUser);

ordersRouter.post("/", async (request, response) => {
  const productId = request.body?.productId;
  const quantity = request.body?.quantity;
  if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
    response.status(400).json({ error: "invalid_order" }); return;
  }
  try {
    const result = await createOrder(authenticatedUserId(request), productId, quantity);
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof OrderError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "order_unavailable" });
  }
});

ordersRouter.get("/", async (request, response) => {
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT o.id, o.order_no, o.product_id, p.name AS product_name,
              o.store_id, o.quantity, o.amount, o.status, o.expires_at, o.created_at,
              CASE WHEN o.status = 'PAID' AND COUNT(v.id) > 0 AND
                  COUNT(v.id) = SUM(v.status = 'USED') THEN 'COMPLETED'
                ELSE o.status END AS display_status
       FROM orders o JOIN products p ON p.id = o.product_id
       LEFT JOIN vouchers v ON v.order_id = o.id
       WHERE o.user_id = ? GROUP BY o.id, p.name ORDER BY o.id DESC LIMIT 100`,
      [authenticatedUserId(request)]
    );
    response.json({ orders: rows });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

ordersRouter.get("/:orderId", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  if (!orderId) { response.status(400).json({ error: "invalid_order_id" }); return; }
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT o.id, o.order_no, o.product_id, p.name AS product_name,
              o.store_id, o.quantity, o.amount, o.status, o.expires_at, o.created_at
       FROM orders o JOIN products p ON p.id = o.product_id
       WHERE o.id = ? AND o.user_id = ? LIMIT 1`,
      [orderId, authenticatedUserId(request)]
    );
    if (!rows.length) { response.status(404).json({ error: "order_not_found" }); return; }
    response.json({ order: rows[0] });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

ordersRouter.post("/:orderId/cancel", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  if (!orderId) { response.status(400).json({ error: "invalid_order_id" }); return; }
  try { response.json(await cancelOrder(authenticatedUserId(request), orderId)); }
  catch (error) {
    if (error instanceof OrderError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "order_unavailable" });
  }
});

ordersRouter.post("/:orderId/prepay", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  if (!orderId) { response.status(400).json({ error: "invalid_order_id" }); return; }
  try {
    const result = await preparePayment(authenticatedUserId(request), authenticatedOpenid(request), orderId);
    response.json(result);
  } catch (error) {
    if (error instanceof OrderError) response.status(error.statusCode).json({ error: error.code });
    else if (error instanceof PaymentError) response.status(503).json({ error: error.code });
    else response.status(503).json({ error: "payment_unavailable" });
  }
});

ordersRouter.post("/:orderId/reconcile", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  if (!orderId) { response.status(400).json({ error: "invalid_order_id" }); return; }
  try { response.json({ status: await reconcileOrder(authenticatedUserId(request), orderId) }); }
  catch (error) {
    if (error instanceof PaymentError && error.code === "order_not_found") response.status(404).json({ error: error.code });
    else response.status(503).json({ error: "reconcile_unavailable" });
  }
});

ordersRouter.get("/:orderId/vouchers", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  if (!orderId) { response.status(400).json({ error: "invalid_order_id" }); return; }
  const pool = createDatabasePool();
  try {
    await pool.execute(
      `UPDATE vouchers v JOIN orders o ON o.id = v.order_id
       SET v.status = 'EXPIRED' WHERE v.order_id = ? AND o.user_id = ?
         AND v.status = 'UNUSED' AND v.valid_until <= UTC_TIMESTAMP(3)`,
      [orderId, authenticatedUserId(request)]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT v.id, v.sequence_no, v.voucher_no, v.status, v.valid_from, v.valid_until, v.used_at
       FROM vouchers v JOIN orders o ON o.id = v.order_id
       WHERE v.order_id = ? AND o.user_id = ? ORDER BY v.sequence_no`,
      [orderId, authenticatedUserId(request)]
    );
    response.json({ vouchers: rows });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

ordersRouter.get("/:orderId/vouchers/:voucherId/qr", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  const voucherId = parseId(String(request.params.voucherId));
  if (!orderId || !voucherId) { response.status(400).json({ error: "invalid_voucher_id" }); return; }
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<(RowDataPacket & { code: string })[]>(
      `SELECT v.code FROM vouchers v JOIN orders o ON o.id = v.order_id
       WHERE v.id = ? AND v.order_id = ? AND o.user_id = ? AND v.status = 'UNUSED'
         AND v.valid_until > UTC_TIMESTAMP(3) LIMIT 1`,
      [voucherId, orderId, authenticatedUserId(request)]
    );
    if (!rows.length) { response.status(404).json({ error: "voucher_not_found" }); return; }
    const png = await QRCode.toBuffer(rows[0].code, { type: "png", width: 360, margin: 2, errorCorrectionLevel: "M" });
    response.set("Cache-Control", "private, no-store");
    response.type("png").send(png);
  } catch { response.status(503).json({ error: "voucher_unavailable" }); }
  finally { await pool.end(); }
});

ordersRouter.post("/:orderId/refund-request", async (request, response) => {
  const orderId = parseId(String(request.params.orderId));
  const reason = request.body?.reason;
  if (!orderId || typeof reason !== "string" || !reason.trim() || Buffer.byteLength(reason.trim(), "utf8") > 80) {
    response.status(400).json({ error: "invalid_refund_request" }); return;
  }
  try { response.status(201).json(await requestRefund(authenticatedUserId(request), orderId, reason.trim())); }
  catch (error) {
    if (error instanceof RefundError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "refund_unavailable" });
  }
});
