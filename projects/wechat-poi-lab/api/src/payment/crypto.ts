import { createSign, createVerify, randomBytes } from "node:crypto";

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}

export function signRsaSha256(message: string, privateKey: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(message, "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
}

export function verifyRsaSha256(message: string, signature: string, publicKey: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message, "utf8");
  verifier.end();
  return verifier.verify(publicKey, signature, "base64");
}

export function requestSignatureMessage(method: string, path: string, timestamp: string, nonce: string, body: string): string {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
}

export function responseSignatureMessage(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

export function miniProgramPayParams(appId: string, prepayId: string, privateKey: string) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomNonce();
  const packageValue = `prepay_id=${prepayId}`;
  const paySign = signRsaSha256(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, privateKey);
  return { timeStamp, nonceStr, package: packageValue, signType: "RSA" as const, paySign };
}
