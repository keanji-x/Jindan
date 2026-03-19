// ============================================================
// API Server — HTTP + WebSocket (delegates to World)
// ============================================================

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import { UNIVERSE } from "./engine/index.js";
import { AiRegistry } from "./entity/ai/AiRegistry.js";
import type { ActionId } from "./entity/types.js";
import { attachFileLogger } from "./logger.js";
import type { WorldEvent } from "./world/types.js";
import { World } from "./world/World.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

class ApiError extends Error {
  name = "ApiError";
}

export class ApiServer {
  private readonly world: World;
  private readonly http: ReturnType<typeof createServer>;
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(world?: World) {
    this.world = world ?? new World();
    this.http = createServer(this.handle.bind(this));
    this.wss = new WebSocketServer({ server: this.http });

    attachFileLogger(this.world);

    this.world.events.onAny((e: WorldEvent) => {
      const msg = JSON.stringify(e);
      for (const c of this.clients) if (c.readyState === 1) c.send(msg);
    });

    this.wss.on("connection", (ws, req) => {
      const addr = req.socket.remoteAddress;
      console.log(`[WS] Client connected from ${addr}, total=${this.clients.size + 1}`);
      this.clients.add(ws);
      ws.send(
        JSON.stringify({
          type: "world_snapshot",
          data: this.world.getSnapshot(),
        }),
      );
      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected, total=${this.clients.size}`);
      });
    });

    // Actor System: 每个拥有 Brain 的 NPC 作为一个独立的 Actor，每秒行动一次
    this.startNpcActorLoop();
  }

  private startNpcActorLoop() {
    setInterval(() => {
      const npcs = this.world.getAliveEntities().filter((e) => e.components.brain);
      for (const npc of npcs) {
        const brain = AiRegistry.get(npc.components.brain!.id);
        if (brain) {
          const actions = this.world.getAvailableActions(npc.id);
          if (actions.length > 0) {
            try {
              const tank = npc.components.tank;
              const core = tank?.coreParticle ?? "ql";
              const qiRatio = tank ? (tank.tanks[core] ?? 0) / (tank.maxTanks[core] ?? 1) : 0;
              const recentEvents = this.world.ledger.graph.getRecentForEntity(npc.id);

              const decision = brain.decide(actions, { qiRatio, recentEvents });
              if (decision) {
                this.world.performAction(
                  npc.id,
                  decision.action,
                  decision.targetId,
                  decision.payload,
                );
              }
            } catch (_e) {
              // 容错处理
            }
          }
        }
      }

      // 天道推演：强制推进一轮时间，触发实体化生 (SpawnPool) 等逻辑
      this.world.settle();
    }, UNIVERSE.tickIntervalMs);
  }

  start(port = 3001): Promise<void> {
    return new Promise((r) =>
      this.http.listen(port, () => {
        console.log(`🌍 金丹世界 API: http://localhost:${port}`);
        r();
      }),
    );
  }

  stop(): Promise<void> {
    return new Promise((r) => {
      this.wss.close();
      this.http.close(() => r());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const result = this.route(req.method!, url.pathname, body);
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
    }
    await this.serveStatic(url.pathname, res);
  }

  private async serveStatic(p: string, res: ServerResponse) {
    const root = join(__dirname, "../../web");
    const full = join(root, p === "/" ? "/index.html" : p);
    if (!full.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const buf = await readFile(full);
      res.writeHead(200, {
        "Content-Type": MIME[extname(full)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  }

  private route(method: string, path: string, body: Record<string, unknown>): unknown | undefined {
    if (method === "GET" && path === "/world/status") return this.world.getSnapshot();

    if (method === "POST" && path === "/entity/create") {
      const name = body.name as string,
        species = body.species as string;
      if (!name) throw new ApiError("name is required");
      if (!["human", "beast", "plant"].includes(species))
        throw new ApiError("species must be human|beast|plant");
      return this.world.createEntity(name, species as "human" | "beast" | "plant");
    }

    if (method === "POST" && path.startsWith("/entity/")) {
      const parts = path.split("/");
      const id = parts[2]!;
      if (parts[3] === "report") {
        const text = body.text as string;
        if (!text) throw new ApiError("text is required");
        const e = this.world.getEntity(id);
        if (!e) throw new ApiError("Entity not found");

        const tick = this.world.tick;
        this.world.ledger.recordEvent({
          tick,
          sourceId: id,
          type: "report",
          data: { text },
        });
        this.world.events.emit({
          tick,
          type: "report",
          data: { entity: e, text },
          message: `[思考] ${e.name} (${id}): ${text}`,
        });
        return { success: true, tick };
      }

      if (parts[3] === "tomb") {
        const epitaph = body.epitaph as string | undefined;
        return this.world.performTomb(id, epitaph);
      }

      if (parts[3] === "reincarnate") {
        const name = body.name as string;
        const species = body.species as string;
        if (!name) throw new ApiError("name is required");
        if (!["human", "beast", "plant"].includes(species))
          throw new ApiError("species must be human|beast|plant");
        return this.world.reincarnate(id, name, species as "human" | "beast" | "plant");
      }
    }

    if (method === "GET" && path.startsWith("/entity/")) {
      const parts = path.split("/");
      const id = parts[2]!;
      const e = this.world.getEntity(id);
      if (!e) throw new ApiError("Entity not found");

      if (parts[3] === "observe") {
        const snapshot = this.world.getSnapshot();
        const recentEvents = this.world.ledger.graph.getEventsByTick(
          this.world.tick - 3,
          this.world.tick,
        );
        return {
          entity: e,
          worldTick: this.world.tick,
          ambientPool: snapshot.ambientPool,
          aliveEntities: snapshot.entities,
          recentEvents,
        };
      }

      if (parts[3] === "memory") {
        return this.world.ledger.graph.getEntityHistory(id);
      }

      if (parts[3] === "plan") {
        return this.world.getAvailableActions(id);
      }

      if (parts[3] === "status") {
        return this.world.getLifeStatus(id);
      }

      return e;
    }

    if (method === "POST" && path === "/action") {
      const { entityId, action, targetId, payload } = body as {
        entityId: string;
        action: ActionId;
        targetId?: string;
        payload?: unknown;
      };
      if (!entityId || !action) throw new ApiError("entityId and action required");
      return this.world.performAction(entityId, action, targetId, payload);
    }

    if (method === "GET" && path === "/leaderboard") {
      return this.world
        .getAliveEntities()
        .sort((a, b) => {
          const aRealm = a.components.cultivation?.realm ?? 0;
          const aPower = a.components.combat?.power ?? 0;
          const bRealm = b.components.cultivation?.realm ?? 0;
          const bPower = b.components.combat?.power ?? 0;
          return bRealm * 1000 + bPower - (aRealm * 1000 + aPower);
        })
        .map((e, i) => {
          const tank = e.components.tank;
          const core = tank?.coreParticle ?? "ql";
          return {
            rank: i + 1,
            id: e.id,
            name: e.name,
            species: e.species,
            realm: e.components.cultivation?.realm ?? 0,
            power: e.components.combat?.power ?? 0,
            qi: tank?.tanks[core] ?? 0,
            maxQi: tank?.maxTanks[core] ?? 0,
          };
        });
    }

    if (method === "GET" && path === "/entities") return this.world.getAliveEntities();

    if (method === "GET" && path === "/graveyard") {
      const dead = this.world.getDeadEntities();
      // Group by soulId so past lives of the same soul are aggregated
      const soulMap = new Map<string, typeof dead>();
      for (const e of dead) {
        const key = e.soulId;
        if (!soulMap.has(key)) soulMap.set(key, []);
        soulMap.get(key)!.push(e);
      }
      return Array.from(soulMap.entries()).map(([soulId, lives]) => ({
        soulId,
        name: lives[lives.length - 1]!.name, // latest incarnation name
        lives: lives.map((e) => ({
          id: e.id,
          name: e.name,
          species: e.species,
          status: e.status,
          epitaph: e.life.article,
        })),
      }));
    }

    return undefined;
  }
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const t = Buffer.concat(chunks).toString();
        resolve(t ? JSON.parse(t) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
