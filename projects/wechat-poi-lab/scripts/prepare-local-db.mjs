import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const localDirectory = path.join(root, ".local");
const sqlPath = path.join(localDirectory, "setup-db.sql");

if (existsSync(envPath) || existsSync(sqlPath)) {
  console.error(".env 或本地建库脚本已存在。为避免覆盖现有密码，未做修改。");
  process.exitCode = 1;
} else {
  const password = randomBytes(24).toString("hex");
  const template = readFileSync(path.join(root, ".env.example"), "utf8");
  if (!template.includes("replace_with_local_password")) {
    throw new Error(".env.example 缺少本地密码占位符");
  }
  const adminPassword = randomBytes(24).toString("hex");
  const env = template
    .replace("replace_with_local_password", password)
    .replace("replace_with_local_admin_password", adminPassword);
  const sql = [
    "CREATE DATABASE IF NOT EXISTS wechat_poi_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    "CREATE USER IF NOT EXISTS 'poi_lab'@'localhost' IDENTIFIED BY '" + password + "';",
    "ALTER USER 'poi_lab'@'localhost' IDENTIFIED BY '" + password + "';",
    "GRANT ALL PRIVILEGES ON wechat_poi_lab.* TO 'poi_lab'@'localhost';",
    "",
  ].join("\n");

  mkdirSync(localDirectory, { recursive: true });
  writeFileSync(envPath, env, { flag: "wx", mode: 0o600 });
  writeFileSync(sqlPath, sql, { flag: "wx", mode: 0o600 });
  console.log("已生成 .env 和 .local/setup-db.sql（均已忽略，不会提交 Git）。");
  console.log("需要在已登录管理员账号的 MySQL Workbench 中执行 setup-db.sql。密码未打印。");
}
