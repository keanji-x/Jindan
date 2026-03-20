// ============================================================
// Server entry point
// ============================================================

import { ApiServer } from "./ApiServer.js";
import { MemoryStorage } from "./storage/MemoryStorage.js";
import { PgStorage } from "./storage/PgStorage.js";
import type { StorageBackend } from "./storage/StorageBackend.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const databaseUrl = process.env.DATABASE_URL;

let storage: StorageBackend;

if (databaseUrl) {
  console.log("📦 使用 PostgreSQL 持久化存储");
  storage = new PgStorage(databaseUrl);
} else {
  console.log("💾 使用内存存储（无持久化）");
  storage = new MemoryStorage();
}

await storage.init();

const server = new ApiServer({ storage });
await server.start(port);
