export class WechatExchangeError extends Error {
  constructor() {
    super("wechat_exchange_failed");
  }
}

export type WechatIdentity = { openid: string };

export async function exchangeWechatCode(
  code: string,
  appId: string,
  appSecret: string,
  request: typeof fetch = fetch
): Promise<WechatIdentity> {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const response = await request(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new WechatExchangeError();
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") throw new WechatExchangeError();
    const result = data as Record<string, unknown>;
    if (
      (result.errcode !== undefined && result.errcode !== 0) ||
      typeof result.openid !== "string" ||
      result.openid.length === 0 ||
      typeof result.session_key !== "string" ||
      result.session_key.length === 0
    ) {
      throw new WechatExchangeError();
    }
    // session_key 只用于确认微信返回有效，不返回前端，也不在本阶段持久化。
    return { openid: result.openid };
  } catch {
    // 不输出完整请求 URL；其中包含 AppSecret 和一次性 code。
    throw new WechatExchangeError();
  }
}
