import { readFileSync } from "node:fs";
import {
  miniProgramPayParams, randomNonce, requestSignatureMessage,
  responseSignatureMessage, signRsaSha256, verifyRsaSha256,
} from "./crypto";

export class PaymentError extends Error {
  constructor(public code: string) { super(code); }
}

export type PaymentConfig = {
  appId: string; mchId: string; apiV3Key: string; privateKey: string;
  serialNo: string; publicKeyId: string; publicKey: string; notifyUrl: string;
};

export function loadPaymentConfig(): PaymentConfig {
  const appId = process.env.WECHAT_APPID ?? "";
  const mchId = process.env.WECHAT_MCHID ?? "";
  const apiV3Key = process.env.WECHAT_API_V3_KEY ?? "";
  const privateKeyPath = process.env.WECHAT_PRIVATE_KEY_PATH ?? "";
  const serialNo = process.env.WECHAT_SERIAL_NO ?? "";
  const publicKeyId = process.env.WECHATPAY_PUBLIC_KEY_ID ?? "";
  const publicKeyPath = process.env.WECHATPAY_PUBLIC_KEY_PATH ?? "";
  const notifyUrl = process.env.WECHAT_NOTIFY_URL ?? "";
  if (!appId || appId === "touristappid" || !mchId || apiV3Key.length !== 32 ||
      !privateKeyPath || !serialNo || !/^PUB_KEY_ID_/.test(publicKeyId) || !publicKeyPath ||
      !/^https:\/\//.test(notifyUrl)) {
    throw new PaymentError("payment_not_configured");
  }
  try {
    return {
      appId, mchId, apiV3Key,
      privateKey: readFileSync(privateKeyPath, "utf8"),
      serialNo, publicKeyId, publicKey: readFileSync(publicKeyPath, "utf8"), notifyUrl,
    };
  } catch {
    throw new PaymentError("payment_not_configured");
  }
}

export class WechatPayClient {
  constructor(public readonly config: PaymentConfig, private readonly request: typeof fetch = fetch) {}

  async requestJson<T>(method: "GET" | "POST", path: string, payload?: object): Promise<T> {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomNonce();
    const signature = signRsaSha256(
      requestSignatureMessage(method, path, timestamp, nonce, body), this.config.privateKey
    );
    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.config.serialNo}"`;

    let response: Response;
    try {
      response = await this.request(`https://api.mch.weixin.qq.com${path}`, {
        method,
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "Wechatpay-Serial": this.config.publicKeyId,
          ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(payload === undefined ? {} : { body }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch { throw new PaymentError("wechatpay_unavailable"); }

    const responseBody = await response.text();
    const replyTimestamp = response.headers.get("wechatpay-timestamp") ?? "";
    const replyNonce = response.headers.get("wechatpay-nonce") ?? "";
    const replySerial = response.headers.get("wechatpay-serial") ?? "";
    const replySignature = response.headers.get("wechatpay-signature") ?? "";
    const replyTime = Number(replyTimestamp);
    if (replySerial !== this.config.publicKeyId || !Number.isSafeInteger(replyTime) ||
        Math.abs(Date.now() / 1000 - replyTime) > 300 ||
        !verifyRsaSha256(
          responseSignatureMessage(replyTimestamp, replyNonce, responseBody),
          replySignature, this.config.publicKey
        )) {
      throw new PaymentError("wechatpay_response_signature_invalid");
    }
    if (!response.ok) throw new PaymentError("wechatpay_request_rejected");
    if (response.status === 204 && responseBody === "") return undefined as T;
    try { return JSON.parse(responseBody) as T; }
    catch { throw new PaymentError("wechatpay_invalid_response"); }
  }

  async prepay(input: {
    orderNo: string; description: string; amount: number; openid: string; expiresAt: Date;
  }): Promise<string> {
    const result = await this.requestJson<{ prepay_id?: string }>(
      "POST", "/v3/pay/transactions/jsapi", {
        appid: this.config.appId,
        mchid: this.config.mchId,
        description: input.description.slice(0, 127),
        out_trade_no: input.orderNo,
        time_expire: input.expiresAt.toISOString(),
        notify_url: this.config.notifyUrl,
        amount: { total: input.amount, currency: "CNY" },
        payer: { openid: input.openid },
      }
    );
    if (!result.prepay_id) throw new PaymentError("wechatpay_invalid_response");
    return result.prepay_id;
  }

  payParams(prepayId: string) {
    return miniProgramPayParams(this.config.appId, prepayId, this.config.privateKey);
  }

  async queryOrder(orderNo: string) {
    return this.requestJson<import("./notification").PaidTransaction>(
      "GET", `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(this.config.mchId)}`
    );
  }

  async closeOrder(orderNo: string): Promise<void> {
    await this.requestJson<void>(
      "POST", `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`,
      { mchid: this.config.mchId }
    );
  }

  async requestRefund(input: { transactionId: string; outRefundNo: string; reason: string; amount: number }) {
    return this.requestJson<import("../refunds/service").RefundResult>("POST", "/v3/refund/domestic/refunds", {
      transaction_id: input.transactionId, out_refund_no: input.outRefundNo,
      reason: input.reason, notify_url: new URL("/api/refunds/notify", this.config.notifyUrl).toString(),
      amount: { refund: input.amount, total: input.amount, currency: "CNY" },
    });
  }

  async queryRefund(outRefundNo: string) {
    return this.requestJson<import("../refunds/service").RefundResult>(
      "GET", `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`
    );
  }
}
