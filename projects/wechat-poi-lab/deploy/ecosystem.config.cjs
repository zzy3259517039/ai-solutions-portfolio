const path = require("node:path");

module.exports = {
  apps: [{
    name: "wechat-poi-lab-api",
    cwd: path.resolve(__dirname, ".."),
    script: "dist/api/server.js",
    instances: 1,
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
    max_memory_restart: "512M",
  }],
};
