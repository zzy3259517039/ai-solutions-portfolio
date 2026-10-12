import express, { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "../db/connection";
import { experimentGroups, stepKeys } from "./steps";

export const experimentRouter = Router();
const statuses = new Set(["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]);

experimentRouter.get("/", async (_request, response) => {
  const pool = createDatabasePool();
  try {
    const [steps] = await pool.query<RowDataPacket[]>(
      "SELECT step_key, status, note, screenshot_mime IS NOT NULL AS has_screenshot, completed_at, updated_at FROM experiment_steps"
    );
    const [settings] = await pool.query<RowDataPacket[]>("SELECT * FROM experiment_settings WHERE id = 1");
    response.json({ groups: experimentGroups, steps, settings: settings[0] ?? null });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

experimentRouter.put("/steps/:key", async (request, response) => {
  const key = String(request.params.key);
  const status = request.body?.status;
  const note = request.body?.note;
  if (!stepKeys.has(key) || !statuses.has(status) || typeof note !== "string" || note.length > 2000) {
    response.status(400).json({ error: "invalid_experiment_step" }); return;
  }
  const pool = createDatabasePool();
  try {
    await pool.execute(
      `INSERT INTO experiment_steps (step_key, status, note, completed_at)
       VALUES (?, ?, ?, IF(? = 'DONE', UTC_TIMESTAMP(3), NULL))
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note),
         completed_at = IF(VALUES(status) = 'DONE', COALESCE(completed_at, UTC_TIMESTAMP(3)), NULL)`,
      [key, status, note.trim(), status]
    );
    response.json({ key, status });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

experimentRouter.put("/settings", async (request, response) => {
  const input = request.body ?? {};
  const storeId = input.storeId;
  const limits = { poiName: 120, poiAddress: 255, poiStatus: 40,
    locationEntry: 120, serviceName: 120, reviewStatus: 40 } as const;
  if (!Number.isSafeInteger(storeId) || storeId < 1 ||
      Object.entries(limits).some(([field, limit]) => typeof input[field] !== "string" || input[field].length > limit) ||
      !["NOT_STARTED", "CLAIMING", "SUBMITTED", "APPROVED", "BLOCKED", "REJECTED"].includes(input.poiStatus) ||
      !["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED", "BLOCKED"].includes(input.reviewStatus) ||
      typeof input.merchantConfirmed !== "boolean") {
    response.status(400).json({ error: "invalid_experiment_settings" }); return;
  }
  const pool = createDatabasePool();
  try {
    const [stores] = await pool.execute<RowDataPacket[]>("SELECT id FROM stores WHERE id = ? LIMIT 1", [storeId]);
    if (!stores.length) { response.status(404).json({ error: "store_not_found" }); return; }
    const miniPath = `/pages/groupbuy/index?store_id=${storeId}`;
    const params = JSON.stringify({ store_id: storeId });
    await pool.execute(
      `INSERT INTO experiment_settings
       (id, store_id, poi_name, poi_address, poi_status, location_entry,
        service_name, mini_path, path_params, review_status, merchant_confirmed_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?, UTC_TIMESTAMP(3), NULL))
       ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), poi_name = VALUES(poi_name),
       poi_address = VALUES(poi_address), poi_status = VALUES(poi_status),
       location_entry = VALUES(location_entry), service_name = VALUES(service_name),
       mini_path = VALUES(mini_path), path_params = VALUES(path_params),
       review_status = VALUES(review_status),
       merchant_confirmed_at = IF(?, COALESCE(merchant_confirmed_at, UTC_TIMESTAMP(3)), NULL)`,
      [storeId, input.poiName.trim(), input.poiAddress.trim(), input.poiStatus, input.locationEntry.trim(),
        input.serviceName.trim(), miniPath, params, input.reviewStatus,
        input.merchantConfirmed ? 1 : 0, input.merchantConfirmed ? 1 : 0]
    );
    response.json({ miniPath, params });
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});

experimentRouter.put("/steps/:key/screenshot",
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }),
  async (request, response) => {
    const key = String(request.params.key);
    const mime = request.header("content-type")?.split(";")[0] ?? "";
    const data = request.body;
    const validMagic = Buffer.isBuffer(data) && (
      (mime === "image/png" && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
      (mime === "image/jpeg" && data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) ||
      (mime === "image/webp" && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP")
    );
    if (!stepKeys.has(key) || !validMagic || data.length > 2_000_000) {
      response.status(400).json({ error: "invalid_screenshot" }); return;
    }
    const pool = createDatabasePool();
    try {
      await pool.execute(
        `INSERT INTO experiment_steps (step_key, screenshot_mime, screenshot_data)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE screenshot_mime = VALUES(screenshot_mime),
         screenshot_data = VALUES(screenshot_data)`, [key, mime, data]
      );
      response.json({ key, hasScreenshot: true });
    } catch { response.status(503).json({ error: "database_unavailable" }); }
    finally { await pool.end(); }
  }
);

experimentRouter.get("/steps/:key/screenshot", async (request, response) => {
  const key = String(request.params.key);
  if (!stepKeys.has(key)) { response.status(404).end(); return; }
  const pool = createDatabasePool();
  try {
    const [rows] = await pool.execute<(RowDataPacket & { screenshot_mime: string; screenshot_data: Buffer })[]>(
      "SELECT screenshot_mime, screenshot_data FROM experiment_steps WHERE step_key = ? LIMIT 1", [key]
    );
    if (!rows.length || !rows[0].screenshot_data) { response.status(404).end(); return; }
    response.set("Cache-Control", "private, no-store");
    response.type(rows[0].screenshot_mime).send(rows[0].screenshot_data);
  } catch { response.status(503).json({ error: "database_unavailable" }); }
  finally { await pool.end(); }
});
