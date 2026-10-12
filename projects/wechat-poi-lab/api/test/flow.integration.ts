import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { saveLogin } from "../src/auth/repository";
import { createDatabasePool } from "../src/db/connection";
import { createOrder } from "../src/orders/service";
import { applyPaidTransaction } from "../src/payment/notification";
import type { PaymentConfig } from "../src/payment/client";
import { reverseVerification, verifyVoucher } from "../src/vouchers/verify";
import { applyRefundResult, requestRefund } from "../src/refunds/service";

test("真实 MySQL：支付幂等发券、核销防重、撤销留痕", async () => {
  const pool = createDatabasePool();
  const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM merchants LIMIT 1");
  if (existing.length) { await pool.end(); throw new Error("流程集成测试只在空实验数据库执行"); }
  const nonce = randomBytes(8).toString("hex");
  const appId = `wx_flow_${nonce}`;
  const openid = `openid_${nonce}`;
  const config = { appId, mchId: `mch_${nonce}` } as PaymentConfig;
  let userId = 0, merchantId = 0, storeId = 0, productId = 0, orderId = 0, adminSessionId = 0;
  try {
    await saveLogin(appId, openid, createHash("sha256").update(randomBytes(32)).digest(), new Date(Date.now() + 60_000));
    const [users] = await pool.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM users WHERE appid = ? AND openid = ?", [appId, openid]
    );
    userId = users[0].id;
    const [merchant] = await pool.execute<ResultSetHeader>("INSERT INTO merchants (name) VALUES ('流程测试商家')");
    merchantId = merchant.insertId;
    const [store] = await pool.execute<ResultSetHeader>(
      "INSERT INTO stores (merchant_id, name, address) VALUES (?, '流程测试门店', '测试地址')", [merchantId]
    );
    storeId = store.insertId;
    const [product] = await pool.execute<ResultSetHeader>(
      `INSERT INTO products (merchant_id, store_id, name, description, original_price, sale_price, stock, valid_days, status)
       VALUES (?, ?, '流程测试套餐', '', 200, 100, 3, 30, 'ACTIVE')`, [merchantId, storeId]
    );
    productId = product.insertId;
    const [session] = await pool.execute<ResultSetHeader>(
      "INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)",
      [createHash("sha256").update(randomBytes(32)).digest(), new Date(Date.now() + 60_000)]
    );
    adminSessionId = session.insertId;
    const created = await createOrder(userId, productId, 2);
    orderId = created.id;
    const transaction = {
      appid: appId, mchid: config.mchId, out_trade_no: created.orderNo,
      transaction_id: `tx_${nonce}`, trade_state: "SUCCESS",
      amount: { total: 200, currency: "CNY" }, payer: { openid }, success_time: new Date().toISOString(),
    };
    await assert.rejects(applyPaidTransaction({ ...transaction, amount: { total: 1, currency: "CNY" } }, config), /payment_mismatch/);
    await applyPaidTransaction(transaction, config);
    await applyPaidTransaction(transaction, config);
    const [vouchers] = await pool.execute<(RowDataPacket & { id: number; voucher_no: string; code: string; status: string })[]>(
      "SELECT id, voucher_no, code, status FROM vouchers WHERE order_id = ? ORDER BY sequence_no", [orderId]
    );
    assert.equal(vouchers.length, 2);
    assert.match(vouchers[0].voucher_no, /^\d{10}$/);
    assert.match(vouchers[0].code, /^[a-f0-9]{32}$/);
    assert.notEqual(vouchers[0].voucher_no, vouchers[0].code);
    await assert.rejects(verifyVoucher(vouchers[0].code, storeId + 1, adminSessionId), /wrong_store/);
    assert.equal((await verifyVoucher(vouchers[0].voucher_no, storeId, adminSessionId)).status, "USED");
    await assert.rejects(verifyVoucher(vouchers[0].code, storeId, adminSessionId), /voucher_not_usable/);
    await assert.rejects(requestRefund(userId, orderId, "已用券退款"), /voucher_not_refundable/);
    assert.equal((await reverseVerification(vouchers[0].id, storeId, adminSessionId, "测试误核销")).status, "UNUSED");
    const [logs] = await pool.execute<(RowDataPacket & { action: string })[]>(
      "SELECT action FROM voucher_verifications WHERE voucher_id = ? ORDER BY id", [vouchers[0].id]
    );
    assert.deepEqual(logs.map((row) => row.action), ["USE", "REVERSE"]);
    const refundRequest = await requestRefund(userId, orderId, "测试整单退款");
    assert.equal(refundRequest.status, "REQUESTED");
    await pool.execute("UPDATE refunds SET status = 'PROCESSING' WHERE id = ?", [refundRequest.refundId]);
    await pool.execute("UPDATE orders SET status = 'REFUNDING' WHERE id = ?", [orderId]);
    const refundResult = {
      mchid: config.mchId, out_refund_no: "", out_trade_no: created.orderNo,
      transaction_id: transaction.transaction_id, refund_id: `refund_${nonce}`,
      status: "SUCCESS", amount: { total: 200, refund: 200, currency: "CNY" },
      success_time: new Date().toISOString(),
    };
    const [refundRows] = await pool.execute<(RowDataPacket & { out_refund_no: string })[]>(
      "SELECT out_refund_no FROM refunds WHERE id = ?", [refundRequest.refundId]
    );
    refundResult.out_refund_no = refundRows[0].out_refund_no;
    await assert.rejects(applyRefundResult({ ...refundResult, amount: { total: 200, refund: 1 } }, config), /refund_mismatch/);
    assert.equal(await applyRefundResult(refundResult, config), "SUCCESS");
    assert.equal(await applyRefundResult(refundResult, config), "SUCCESS");
    const [refunded] = await pool.execute<(RowDataPacket & { status: string })[]>(
      "SELECT status FROM vouchers WHERE order_id = ?", [orderId]
    );
    assert.deepEqual(refunded.map((row) => row.status), ["REFUNDED", "REFUNDED"]);
    await assert.rejects(verifyVoucher(vouchers[0].code, storeId, adminSessionId), /voucher_not_usable/);
  } finally {
    if (orderId) {
      await pool.execute("DELETE FROM refunds WHERE order_id = ?", [orderId]);
      await pool.execute("DELETE FROM voucher_verifications WHERE voucher_id IN (SELECT id FROM vouchers WHERE order_id = ?)", [orderId]);
      await pool.execute("DELETE FROM vouchers WHERE order_id = ?", [orderId]);
      await pool.execute("DELETE FROM orders WHERE id = ?", [orderId]);
    }
    if (adminSessionId) await pool.execute("DELETE FROM admin_sessions WHERE id = ?", [adminSessionId]);
    if (productId) await pool.execute("DELETE FROM products WHERE id = ?", [productId]);
    if (storeId) await pool.execute("DELETE FROM stores WHERE id = ?", [storeId]);
    if (merchantId) await pool.execute("DELETE FROM merchants WHERE id = ?", [merchantId]);
    if (userId) {
      await pool.execute("DELETE FROM user_sessions WHERE user_id = ?", [userId]);
      await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
    }
    await pool.end();
  }
});
