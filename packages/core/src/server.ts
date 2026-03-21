// ============================================================
// Server entry point
// ============================================================

import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import { ApiServer } from "./ApiServer.js";
import { MemoryStorage } from "./storage/MemoryStorage.js";
import { PgStorage } from "./storage/PgStorage.js";
import type { StorageBackend } from "./storage/StorageBackend.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const databaseUrl = process.env.DATABASE_URL;
const isDevMode = !databaseUrl || databaseUrl === "memory";

let storage: StorageBackend;

if (isDevMode) {
  console.log("💾 使用内存存储（无持久化）");
  storage = new MemoryStorage();

  // Dev 模式：自动生成临时 JWT_SECRET
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    console.log("🔑 Dev 模式：已自动生成临时 JWT_SECRET");
  }
} else {
  console.log("📦 使用 PostgreSQL 持久化存储");
  storage = new PgStorage(databaseUrl);
}

await storage.init();

const server = new ApiServer({ storage });
await server.start(port);
