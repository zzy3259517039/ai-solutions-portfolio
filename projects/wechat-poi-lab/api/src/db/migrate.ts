import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { createDatabasePool } from "./connection";

async function main() {
  const pool = createDatabasePool();
  const migrationsDirectory = path.resolve(process.cwd(), "db/migrations");

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [rows] = await pool.query<(RowDataPacket & { filename: string })[]>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(rows.map((row) => row.filename));
    const files = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
      .sort();

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      await pool.query(sql);
      await pool.execute("INSERT INTO schema_migrations (filename) VALUES (?)", [filename]);
      console.log(`已应用迁移: ${filename}`);
    }

    console.log(`数据库迁移检查完成，共 ${files.length} 个迁移文件。`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("数据库迁移失败:", error);
  process.exitCode = 1;
});
