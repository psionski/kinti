#!/usr/bin/env node

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync, spawn } = require("child_process");

const packageRoot = path.resolve(__dirname, "..");
const pkg = require(path.join(packageRoot, "package.json"));
const nextCli = path.join(packageRoot, "node_modules", "next", "dist", "bin", "next");

const args = process.argv.slice(2);
const subcommand = args[0] === "update" ? "update" : "start";

function parseFlag(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

if (subcommand === "update") {
  console.log("Updating kinti to latest version...");
  try {
    execSync("npm install -g kinti@latest", { stdio: "inherit" });
    console.log("\nUpdate complete. Run `kinti start` to apply.");
  } catch {
    process.exit(1);
  }
  process.exit(0);
}

// --- start subcommand ---

const port = parseFlag("--port", process.env.PORT ?? "4000");
const dataDir = path.resolve(
  parseFlag("--data", process.env.KINTI_DATA ?? path.join(os.homedir(), ".kinti"))
);

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });

process.env.DATABASE_URL = path.join(dataDir, "kinti.db");
process.env.LOG_DIR = path.join(dataDir, "logs");
process.env.PORT = port;

// Non-blocking update check (update-notifier is ESM-only)
import("update-notifier")
  .then(({ default: updateNotifier }) => {
    updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify();
  })
  .catch(() => {});

// Start the server
const server = spawn(process.execPath, [nextCli, "start", "--port", port], {
  cwd: packageRoot,
  stdio: "inherit",
  env: { ...process.env },
});

server.on("exit", (code) => process.exit(code ?? 0));

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.kill(sig));
}
