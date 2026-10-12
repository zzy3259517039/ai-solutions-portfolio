import express from "express";
import { checkDatabase } from "./db/connection";
import { loginWithWechat, type LoginResult } from "./auth/login";
import { WechatExchangeError } from "./auth/wechat";
import { adminRouter, catalogRouter } from "./catalog/routes";
import { ordersRouter } from "./orders/routes";
import { handlePaymentNotification } from "./payment/notification";
import { decodeNotification } from "./payment/notification";
import { loadPaymentConfig } from "./payment/client";
import { applyRefundResult, type RefundResult } from "./refunds/service";

type AppDependencies = {
  databaseCheck?: () => Promise<void>;
  login?: (code: string) => Promise<LoginResult>;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const databaseCheck = dependencies.databaseCheck ?? checkDatabase;
  const login = dependencies.login ?? loginWithWechat;

  app.post("/api/payment/notify", express.raw({ type: "application/json", limit: "64kb" }), async (request, response) => {
    try {
      await handlePaymentNotification(request);
      response.status(204).end();
    } catch {
      response.status(500).json({ code: "FAIL", message: "notification_not_accepted" });
    }
  });
  app.post("/api/refunds/notify", express.raw({ type: "application/json", limit: "64kb" }), async (request, response) => {
    try {
      const config = loadPaymentConfig();
      const refund = decodeNotification(request, config, "refund") as RefundResult;
      const eventType = (JSON.parse((request.body as Buffer).toString("utf8")) as { event_type?: string }).event_type;
      if (eventType !== `REFUND.${refund.refund_status}`) throw new Error("refund_event_mismatch");
      await applyRefundResult(refund, config);
      response.status(204).end();
    } catch {
      response.status(500).json({ code: "FAIL", message: "notification_not_accepted" });
    }
  });
  app.use(express.json({ limit: "8kb" }));
  app.use("/api", catalogRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/orders", ordersRouter);

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", implementationPhase: 12, realFlowVerified: false, service: "api" });
  });

  app.get("/api/ready", async (_request, response) => {
    try {
      await databaseCheck();
      response.json({ status: "ok", database: "connected" });
    } catch {
      response.status(503).json({ status: "unavailable", database: "disconnected" });
    }
  });

  app.post("/api/auth/wechat-login", async (request, response) => {
    const code = request.body?.code;
    if (typeof code !== "string" || code.length < 1 || code.length > 512 || code.trim() !== code) {
      response.status(400).json({ error: "invalid_code" });
      return;
    }

    try {
      const result = await login(code);
      response.json(result);
    } catch (error) {
      if (error instanceof WechatExchangeError) {
        response.status(502).json({ error: "wechat_exchange_failed" });
      } else if (error instanceof Error && error.message === "wechat_not_configured") {
        response.status(503).json({ error: "wechat_not_configured" });
      } else {
        response.status(500).json({ error: "login_failed" });
      }
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "invalid_json" });
      return;
    }
    response.status(500).json({ error: "internal_error" });
  });

  return app;
}
