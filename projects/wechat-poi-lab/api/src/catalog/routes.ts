import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { adminLogin, authenticatedAdminSessionId, requireAdmin } from "../admin/auth";
import { createDatabasePool } from "../db/connection";
import { parseId, parseProductInput } from "./validation";
import { reverseVerification, verifyVoucher, VoucherError } from "../vouchers/verify";
import { reconcileRefund, submitRefund, RefundError } from "../refunds/service";
import { experimentRouter } from "../experiments/routes";

export const catalogRouter = Router();

catalogRouter.get("/stores/:storeId/catalog", async (request, response) => {
  const storeId = parseId(String(request.params.storeId));
  if (!storeId) { response.status(400).json({ error: "invalid_store_id" }); return; }
  const pool = createDatabasePool();
  try {
    const [stores] = await pool.execute<RowDataPacket[]>(
      `SELECT s.id, s.name, s.address, s.merchant_id, m.name AS merchant_name
       FROM stores s JOIN merchants m ON m.id = s.merchant_id
       WHERE s.id = ? AND s.status = 'ACTIVE' LIMIT 1`, [storeId]
    );
    if (stores.length === 0) { response.status(404).json({ error: "store_not_found" }); return; }
    const [products] = await pool.execute<RowDataPacket[]>(
      `SELECT id, store_id, name, description, original_price, sale_price, stock, valid_days
       FROM products WHERE store_id = ? AND status = 'ACTIVE' ORDER BY id DESC`, [storeId]
    );
    response.json({ store: stores[0], products });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
});

catalogRouter.get("/products/:productId", async (request, response) => {
  const productId = parseId(String(request.params.productId));
  if (!productId) { response.status(400).json({ error: "invalid_product_id" }); return; }
  const pool = createDatabasePool();
  try {
    const [products] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.store_id, p.name, p.description, p.original_price,
              p.sale_price, p.stock, p.valid_days, s.name AS store_name
       FROM products p JOIN stores s ON s.id = p.store_id
       WHERE p.id = ? AND p.status = 'ACTIVE' AND s.status = 'ACTIVE' LIMIT 1`,
      [productId]
    );
    if (!products.length) { response.status(404).json({ error: "product_not_found" }); return; }
    response.json({ product: products[0] });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

export const adminRouter = Router();
adminRouter.post("/login", adminLogin);
adminRouter.use(requireAdmin);
adminRouter.use("/experiments", experimentRouter);

adminRouter.get("/catalog", async (_request, response) => {
  const pool = createDatabasePool();
  try {
    const [merchants] = await pool.query<RowDataPacket[]>(
      "SELECT id, name, credit_code, legal_representative, contact_phone, industry, wechat_appid, wechat_mchid FROM merchants ORDER BY id"
    );
    const [stores] = await pool.query<RowDataPacket[]>("SELECT id, merchant_id, name, address, status FROM stores ORDER BY id");
    const [products] = await pool.query<RowDataPacket[]>(
      "SELECT id, store_id, name, original_price, sale_price, stock, valid_days, status FROM products ORDER BY id DESC"
    );
    response.json({ merchants, stores, products });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
});

adminRouter.put("/merchants/:merchantId/profile", async (request, response) => {
  const merchantId = parseId(String(request.params.merchantId));
  const input = request.body ?? {};
  const limits = { name: 120, creditCode: 32, legalRepresentative: 80, contactPhone: 32,
    industry: 80, wechatAppid: 64, wechatMchid: 64 } as const;
  if (!merchantId || Object.entries(limits).some(([key, limit]) =>
    typeof input[key] !== "string" || !input[key].trim() && key === "name" || input[key].length > limit)) {
    response.status(400).json({ error: "invalid_merchant_profile" }); return;
  }
  const pool = createDatabasePool();
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE merchants SET name = ?, credit_code = ?, legal_representative = ?,
       contact_phone = ?, industry = ?, wechat_appid = ?, wechat_mchid = ? WHERE id = ?`,
      [input.name.trim(), input.creditCode.trim(), input.legalRepresentative.trim(),
        input.contactPhone.trim(), input.industry.trim(), input.wechatAppid.trim(), input.wechatMchid.trim(), merchantId]
    );
    if (!result.affectedRows) { response.status(404).json({ error: "merchant_not_found" }); return; }
    response.json({ id: merchantId });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

adminRouter.post("/merchants", async (request, response) => {
  const name = request.body?.name;
  if (typeof name !== "string" || !name.trim() || name.length > 120) {
    response.status(400).json({ error: "invalid_merchant" }); return;
  }
  const pool = createDatabasePool();
  try {
    const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM merchants LIMIT 1");
    if (existing.length > 0) { response.status(409).json({ error: "single_merchant_only" }); return; }
    const [result] = await pool.execute<ResultSetHeader>("INSERT INTO merchants (name) VALUES (?)", [name.trim()]);
    response.status(201).json({ id: result.insertId });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
});

adminRouter.post("/stores", async (request, response) => {
  const name = request.body?.name;
  const address = request.body?.address;
  if (typeof name !== "string" || !name.trim() || name.length > 120 ||
      typeof address !== "string" || !address.trim() || address.length > 255) {
    response.status(400).json({ error: "invalid_store" }); return;
  }
  const pool = createDatabasePool();
  try {
    const [merchants] = await pool.query<(RowDataPacket & { id: number })[]>("SELECT id FROM merchants LIMIT 1");
    if (merchants.length === 0) { response.status(409).json({ error: "merchant_required" }); return; }
    const [result] = await pool.execute<ResultSetHeader>(
      "INSERT INTO stores (merchant_id, name, address) VALUES (?, ?, ?)",
      [merchants[0].id, name.trim(), address.trim()]
    );
    response.status(201).json({ id: result.insertId });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
});

adminRouter.post("/products", async (request, response) => {
  const product = parseProductInput(request.body);
  if (!product) { response.status(400).json({ error: "invalid_product" }); return; }
  const pool = createDatabasePool();
  try {
    const [stores] = await pool.execute<(RowDataPacket & { merchant_id: number })[]>(
      "SELECT merchant_id FROM stores WHERE id = ? AND status = 'ACTIVE' LIMIT 1", [product.storeId]
    );
    if (stores.length === 0) { response.status(404).json({ error: "store_not_found" }); return; }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO products
       (merchant_id, store_id, name, description, original_price, sale_price, stock, valid_days, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [stores[0].merchant_id, product.storeId, product.name, product.description,
        product.originalPrice, product.salePrice, product.stock, product.validDays, product.status]
    );
    response.status(201).json({ id: result.insertId });
  } catch {
    response.status(503).json({ error: "database_unavailable" });
  } finally { await pool.end(); }
});

adminRouter.post("/vouchers/verify", async (request, response) => {
  const code = request.body?.code;
  const storeId = request.body?.storeId;
  if (typeof code !== "string" || !(/^[a-f0-9]{32}$/.test(code) || /^\d{10}$/.test(code)) || !Number.isSafeInteger(storeId) || storeId < 1) {
    response.status(400).json({ error: "invalid_voucher_input" }); return;
  }
  try { response.json(await verifyVoucher(code, storeId, authenticatedAdminSessionId(request))); }
  catch (error) {
    if (error instanceof VoucherError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "verification_unavailable" });
  }
});

adminRouter.post("/vouchers/:voucherId/reverse", async (request, response) => {
  const voucherId = parseId(String(request.params.voucherId));
  const storeId = request.body?.storeId;
  const reason = request.body?.reason;
  if (!voucherId || !Number.isSafeInteger(storeId) || storeId < 1 ||
      typeof reason !== "string" || !reason.trim() || reason.length > 255) {
    response.status(400).json({ error: "invalid_reversal_input" }); return;
  }
  try { response.json(await reverseVerification(voucherId, storeId, authenticatedAdminSessionId(request), reason.trim())); }
  catch (error) {
    if (error instanceof VoucherError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "reversal_unavailable" });
  }
});

adminRouter.get("/vouchers/verifications", async (_request, response) => {
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT l.id, l.voucher_id, v.voucher_no, s.name AS store_name,
              a.operator_name, l.action, l.reason, l.created_at
       FROM voucher_verifications l JOIN vouchers v ON v.id = l.voucher_id
       JOIN stores s ON s.id = l.store_id JOIN admin_sessions a ON a.id = l.admin_session_id
       ORDER BY l.id DESC LIMIT 100`
    );
    response.json({ logs: rows });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

adminRouter.get("/refunds", async (_request, response) => {
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.order_id, o.order_no, r.amount, r.reason, r.status, r.requested_at
       FROM refunds r JOIN orders o ON o.id = r.order_id ORDER BY r.id DESC LIMIT 100`
    );
    response.json({ refunds: rows });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

adminRouter.post("/refunds/:refundId/submit", async (request, response) => {
  const refundId = parseId(String(request.params.refundId));
  if (!refundId) { response.status(400).json({ error: "invalid_refund_id" }); return; }
  try { response.json(await submitRefund(refundId)); }
  catch (error) {
    if (error instanceof RefundError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "refund_submit_unavailable" });
  }
});

adminRouter.post("/refunds/:refundId/reconcile", async (request, response) => {
  const refundId = parseId(String(request.params.refundId));
  if (!refundId) { response.status(400).json({ error: "invalid_refund_id" }); return; }
  try { response.json(await reconcileRefund(refundId)); }
  catch (error) {
    if (error instanceof RefundError) response.status(error.statusCode).json({ error: error.code });
    else response.status(503).json({ error: "refund_reconcile_unavailable" });
  }
});
