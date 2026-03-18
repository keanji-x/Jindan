// ============================================================
// API Server — HTTP + WebSocket + Static file serving
// ============================================================

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import type { WorldEvent } from "./types.js";
import { World } from "./World.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiServer {
  private readonly world: World;
  private readonly httpServer: ReturnType<typeof createServer>;
  private readonly wss: WebSocketServer;
  private readonly wsClients = new Set<WebSocket>();

  constructor(world?: World) {
    this.world = world ?? new World();
    this.httpServer = createServer(this.handleHttp.bind(this));
    this.wss = new WebSocketServer({ server: this.httpServer });

    // WebSocket: broadcast all world events
    this.world.events.onAny((event: WorldEvent) => {
      const msg = JSON.stringify(event);
      for (const client of this.wsClients) {
        if (client.readyState === 1 /* OPEN */) {
          client.send(msg);
        }
      }
    });

    this.wss.on("connection", (ws) => {
      this.wsClients.add(ws);
      // 发送当前世界快照
      ws.send(
        JSON.stringify({
          type: "world_snapshot",
          data: this.world.getSnapshot(),
        }),
      );
      ws.on("close", () => this.wsClients.delete(ws));
    });
  }

  start(port = 3001): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(port, () => {
        console.log(`🌍 金丹世界 API 启动: http://localhost:${port}`);
        console.log(`🔌 WebSocket 地址: ws://localhost:${port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close();
      this.httpServer.close(() => resolve());
    });
  }

  // ── HTTP Router ────────────────────────────────────────

  private async handleHttp(req: IncomingMessage, res: ServerResponse) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    // Try API routes first
    try {
      let body: Record<string, unknown> = {};
      if (method === "POST") {
        body = await readJson(req);
      }

      const result = this.route(method, path, body, url.searchParams);
      if (result !== undefined) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result, null, 2));
        return;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      // Not an API error — fall through to static files
    }

    // Serve static files from packages/web/
    await this.serveStatic(path, res);
  }

  private async serveStatic(urlPath: string, res: ServerResponse) {
    const webRoot = join(__dirname, "../../web");
    const filePath = urlPath === "/" ? "/index.html" : urlPath;
    const fullPath = join(webRoot, filePath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(webRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const content = await readFile(fullPath);
      const ext = extname(fullPath);
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  private route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    _params: URLSearchParams,
  ): unknown | undefined {
    // ── World ──────────────────────────────────────────
    if (method === "GET" && path === "/world/status") {
      return this.world.getSnapshot();
    }

    // ── Cultivator CRUD ────────────────────────────────
    if (method === "POST" && path === "/cultivator/create") {
      const name = body.name as string;
      if (!name) throw new ApiError("name is required");
      return this.world.createCultivator(name);
    }

    if (method === "GET" && path.startsWith("/cultivator/")) {
      const id = path.split("/")[2]!;
      const c = this.world.getCultivator(id);
      if (!c) throw new ApiError("Cultivator not found");
      return c;
    }

    // ── Actions ────────────────────────────────────────
    if (method === "POST" && path === "/action/cultivate") {
      const cultivatorId = body.cultivatorId as string;
      if (!cultivatorId) throw new Error("cultivatorId is required");
      return this.world.actionCultivate(cultivatorId);
    }

    if (method === "POST" && path === "/action/breakthrough") {
      const cultivatorId = body.cultivatorId as string;
      if (!cultivatorId) throw new Error("cultivatorId is required");
      return this.world.actionBreakthrough(cultivatorId);
    }

    if (method === "POST" && path === "/action/fight-beast") {
      const cultivatorId = body.cultivatorId as string;
      const beastId = body.beastId as string | undefined;
      if (!cultivatorId) throw new Error("cultivatorId is required");
      return this.world.actionFightBeast(cultivatorId, beastId);
    }

    if (method === "POST" && path === "/action/fight-pvp") {
      const attackerId = body.attackerId as string;
      const defenderId = body.defenderId as string;
      if (!attackerId || !defenderId) {
        throw new ApiError("attackerId and defenderId are required");
      }
      return this.world.actionFightPvP(attackerId, defenderId);
    }

    if (method === "POST" && path === "/action/pickup-stones") {
      const cultivatorId = body.cultivatorId as string;
      if (!cultivatorId) throw new Error("cultivatorId is required");
      return this.world.actionPickupStones(cultivatorId);
    }

    // ── Leaderboard ────────────────────────────────────
    if (method === "GET" && path === "/leaderboard") {
      return this.world
        .getAliveCultivators()
        .sort((a, b) => b.realm * 1000 + b.power - (a.realm * 1000 + a.power))
        .map((c, i) => ({
          rank: i + 1,
          id: c.id,
          name: c.name,
          realm: c.realm,
          power: c.power,
          spiritStones: c.spiritStones,
        }));
    }

    // ── Beasts ─────────────────────────────────────────
    if (method === "GET" && path === "/beasts") {
      return this.world.getAliveBeasts();
    }

    return undefined; // Not an API route → fall through to static files
  }
}

// ── Helpers ──────────────────────────────────────────────

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
