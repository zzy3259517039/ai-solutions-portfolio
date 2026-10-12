import { createPool, type PoolOptions } from "mysql2/promise";

function databaseOptions(): PoolOptions {
  const port = Number(process.env.DB_PORT ?? "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT 必须是 1～65535 的整数");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    database: process.env.DB_NAME ?? "wechat_poi_lab",
    user: process.env.DB_USER ?? "poi_lab",
    password: process.env.DB_PASSWORD ?? "",
    timezone: "Z",
    connectionLimit: 5,
    connectTimeout: 3000,
  };
}

export function createDatabasePool() {
  return createPool(databaseOptions());
}

export async function checkDatabase(): Promise<void> {
  const pool = createDatabasePool();
  try {
    await pool.query("SELECT 1");
  } finally {
    await pool.end();
  }
}
