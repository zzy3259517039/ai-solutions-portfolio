import { createHash, randomBytes } from "node:crypto";
import { saveLogin } from "./repository";
import { exchangeWechatCode, type WechatIdentity } from "./wechat";

export type LoginResult = { openid: string; token: string; expiresAt: string };

type LoginDependencies = {
  appId: string;
  appSecret: string;
  exchangeCode: (code: string, appId: string, appSecret: string) => Promise<WechatIdentity>;
  persist: (appId: string, openid: string, tokenHash: Buffer, expiresAt: Date) => Promise<void>;
};

export async function createLogin(code: string, dependencies: LoginDependencies): Promise<LoginResult> {
  if (!dependencies.appId || !dependencies.appSecret || dependencies.appId === "touristappid") {
    throw new Error("wechat_not_configured");
  }

  const { openid } = await dependencies.exchangeCode(code, dependencies.appId, dependencies.appSecret);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await dependencies.persist(dependencies.appId, openid, tokenHash, expiresAt);
  return { openid, token, expiresAt: expiresAt.toISOString() };
}

export function loginWithWechat(code: string): Promise<LoginResult> {
  return createLogin(code, {
    appId: process.env.WECHAT_APPID ?? "",
    appSecret: process.env.WECHAT_SECRET ?? "",
    exchangeCode: exchangeWechatCode,
    persist: saveLogin,
  });
}
