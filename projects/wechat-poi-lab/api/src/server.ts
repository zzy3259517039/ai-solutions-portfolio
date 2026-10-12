import "dotenv/config";
import { createApp } from "./app";
import { expireUnpaidOrders } from "./orders/expiry";

const port = Number(process.env.API_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT 必须是 1～65535 的整数");
}

createApp().listen(port, "127.0.0.1", () => {
  console.log(`POI Lab API: http://127.0.0.1:${port}/api/health`);
});

let sweeping = false;
setInterval(() => {
  if (sweeping) return;
  sweeping = true;
  void expireUnpaidOrders().catch(() => {
    console.error("过期订单检查失败，请查看数据库与微信支付连接");
  }).finally(() => { sweeping = false; });
}, 60_000).unref();
