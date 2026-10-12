import assert from "node:assert/strict";
import { createCipheriv, generateKeyPairSync, randomBytes } from "node:crypto";
import { test } from "node:test";
import type { Request } from "express";
import { miniProgramPayParams, responseSignatureMessage, signRsaSha256, verifyRsaSha256 } from "../src/payment/crypto";
import { verifyNotification } from "../src/payment/notification";
import type { PaymentConfig } from "../src/payment/client";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
const config: PaymentConfig = {
  appId: "wx_test", mchId: "merchant_test", apiV3Key: "0123456789abcdef0123456789abcdef",
  privateKey, publicKey, serialNo: "serial_test", publicKeyId: "PUB_KEY_ID_123",
  notifyUrl: "https://example.test/api/payment/notify",
};

test("小程序支付参数由服务端私钥签名", () => {
  const params = miniProgramPayParams(config.appId, "prepay_test", privateKey);
  assert.equal(params.package, "prepay_id=prepay_test");
  assert.equal(params.signType, "RSA");
  assert.ok(verifyRsaSha256(
    `${config.appId}\n${params.timeStamp}\n${params.nonceStr}\n${params.package}\n`, params.paySign, publicKey
  ));
});

test("支付回调只接受验签成功且可解密的原始报文", () => {
  const transaction = {
    appid: config.appId, mchid: config.mchId, out_trade_no: "P123", transaction_id: "T123",
    trade_state: "SUCCESS", amount: { total: 100, currency: "CNY" },
    payer: { openid: "openid_test" }, success_time: new Date().toISOString(),
  };
  const nonce = randomBytes(12).toString("hex").slice(0, 12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from("transaction"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(transaction)), cipher.final(), cipher.getAuthTag()]);
  const body = Buffer.from(JSON.stringify({
    event_type: "TRANSACTION.SUCCESS", resource_type: "encrypt-resource",
    resource: { original_type: "transaction", algorithm: "AEAD_AES_256_GCM",
      ciphertext: encrypted.toString("base64"), associated_data: "transaction", nonce },
  }));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signRsaSha256(responseSignatureMessage(timestamp, "nonce", body.toString()), privateKey);
  const headers: Record<string, string> = {
    "wechatpay-timestamp": timestamp, "wechatpay-nonce": "nonce",
    "wechatpay-serial": config.publicKeyId, "wechatpay-signature": signature,
  };
  const request = { body, header: (name: string) => headers[name] } as Request;
  assert.deepEqual(verifyNotification(request, config), transaction);
  headers["wechatpay-signature"] = signRsaSha256("tampered", privateKey);
  assert.throws(() => verifyNotification(request, config), /invalid_notification_signature/);
});
