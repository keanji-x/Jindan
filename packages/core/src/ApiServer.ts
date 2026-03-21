// ============================================================
// API Server — HTTP + WebSocket (delegates to World)
// ============================================================

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import { BotService } from "./BotService.js";
import { attachFileLogger } from "./logger.js";
import type { StorageBackend } from "./storage/StorageBackend.js";
import { AiRegistry } from "./world/brains/OptimizerRegistry.js";
import { UNIVERSE } from "./world/config/universe.config.js";
import type { ActionId, WorldEvent } from "./world/types.js";
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

// ── Security: CORS ────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
];

// ── Security: Rate Limiter ────────────────────────────────
class RateLimiter {
  private attempts = new Map<string, number[]>();
  constructor(
    private windowMs: number,
    private maxAttempts: number,
  ) {}
  check(key: string): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = (this.attempts.get(key) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= this.maxAttempts) {
      throw new ApiError("请求过于频繁，请稍后再试");
    }
    timestamps.push(now);
    this.attempts.set(key, timestamps);
  }
}

// 登录/注册: 每 IP 每分钟 10 次
const authLimiter = new RateLimiter(60_000, 10);

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

class ApiError extends Error {
  name = "ApiError";
}

export class ApiServer {
  private readonly world: World;
  private readonly bot: BotService;
  private readonly http: ReturnType<typeof createServer>;
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private tickInterval?: ReturnType<typeof setInterval>;

  constructor(options?: { world?: World; storage?: StorageBackend }) {
    const storage = options?.storage;
    this.world = options?.world ?? new World(storage);
    this.bot = new BotService(this.world, storage ?? this.world.storage);
    this.http = createServer(this.handle.bind(this));
    this.wss = new WebSocketServer({ server: this.http });

    attachFileLogger(this.world);

    this.world.events.onAny((e: WorldEvent) => {
      const msg = JSON.stringify(e);
      for (const c of this.clients) if (c.readyState === 1) c.send(msg);
    });

    this.wss.on("connection", (ws, req) => {
      // ── WebSocket 认证：需要 ?token=<jwt> 参数 ──
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const token = url.searchParams.get("token");
      if (!token) {
        ws.close(4401, "Authentication required");
        return;
      }
      try {
        this.bot.verifyToken(token);
      } catch {
        ws.close(4401, "Invalid token");
        return;
      }

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
    this.tickInterval = setInterval(() => {
      const npcs = this.world.getAliveEntities().filter((e) => e.components.brain);
      for (const npc of npcs) {
        const brain = AiRegistry.get(npc.components.brain!.id);
        if (brain) {
          const actions = this.world.getAvailableActions(npc.id);
          if (actions.length > 0) {
            try {
              const tank = npc.components.tank;
              const core = tank?.coreParticle ?? "ql";
              const qiCurrent = tank ? (tank.tanks[core] ?? 0) : 0;
              const qiMax = tank ? (tank.maxTanks[core] ?? 1) : 1;
              const qiRatio = qiCurrent / qiMax;
              const recentEvents = this.world.eventGraph.getRecentForEntity(npc.id);

              const decision = brain.decide(actions, { qiCurrent, qiMax, qiRatio, recentEvents });
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
      this.http.listen(port, "0.0.0.0", () => {
        console.log(`🌍 金丹世界 API: http://127.0.0.1:${port}`);
        console.log(`(注: 如果浏览器打开 localhost 白屏转圈，请使用上面的 127.0.0.1 链接)`);
        r();
      }),
    );
  }

  stop(): Promise<void> {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
    return new Promise((r) => {
      this.wss.close();
      this.http.close(() => r());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    // ── CORS ────────────────────────────────────────────
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]!);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Agent-Secret");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const result = await this.route(req.method!, url.pathname, body, req);
      if (result !== undefined) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result, null, 2));
        return;
      }
    } catch (err) {
      const status = err instanceof ApiError ? 400 : 500;
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
      return;
    }
    await this.serveStatic(url.pathname, res);
  }

  private async serveStatic(p: string, res: ServerResponse) {
    const root = join(__dirname, "../../web/dist");
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
      // SPA fallback: serve index.html for client-side routing
      try {
        const index = await readFile(join(root, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(index);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice(7);
    return null;
  }

  private extractAgentSecret(req: IncomingMessage): string | null {
    const secret = req.headers["x-agent-secret"];
    if (typeof secret === "string" && secret) return secret;
    return null;
  }

  private requireAgentSecret(req: IncomingMessage, entityId: string): void {
    const secret = this.extractAgentSecret(req);
    if (!secret) throw new ApiError("Agent secret required (X-Agent-Secret header)");
    this.bot.verifyAgentAccess(entityId, secret);
  }

  private async route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    req: IncomingMessage,
  ): Promise<unknown | undefined> {
    if (method === "GET" && path === "/world/status") return this.world.getSnapshot();

    if (method === "POST" && path === "/entity/create") {
      throw new ApiError("Direct entity creation disabled. Use /bot/create with invite code.");
    }

    if (method === "POST" && path.startsWith("/entity/")) {
      const parts = path.split("/");
      const id = parts[2]!;

      // Agent 认证：所有 POST /entity/* 操作需要 secret
      this.requireAgentSecret(req, id);

      if (parts[3] === "report") {
        const text = body.text as string;
        if (!text) throw new ApiError("text is required");
        const e = this.world.getEntity(id);
        if (!e) throw new ApiError("Entity not found");

        const tick = this.world.tick;
        this.world.recordEvent({
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
        if (!UNIVERSE.reactors[species])
          throw new ApiError(
            `unknown species: ${species}. Available: ${Object.keys(UNIVERSE.reactors).join(", ")}`,
          );
        return this.world.reincarnate(id, name, species);
      }
    }

    if (method === "GET" && path.startsWith("/entity/")) {
      const parts = path.split("/");
      const id = parts[2]!;
      const e = this.world.getEntity(id);
      if (!e) throw new ApiError("Entity not found");

      if (parts[3] === "observe") {
        const snapshot = this.world.getSnapshot();
        const recentEvents = this.world.eventGraph.getEventsByTick(
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
        return this.world.eventGraph.getEntityHistory(id);
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
      // Agent 认证
      this.requireAgentSecret(req, entityId);
      return this.world.performAction(entityId, action, targetId, payload);
    }

    if (method === "GET" && path === "/leaderboard") {
      return this.world
        .getAliveEntities()
        .sort((a, b) => {
          const aRealm = a.components.cultivation?.realm ?? 0;
          const bRealm = b.components.cultivation?.realm ?? 0;
          return bRealm - aRealm;
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
            qi: tank?.tanks[core] ?? 0,
            maxQi: tank?.maxTanks[core] ?? 0,
          };
        });
    }

    if (method === "GET" && path === "/entities") return this.world.getAliveEntities();

    // ── Auth 路由 ─────────────────────────────────────────

    if (method === "POST" && path === "/auth/register") {
      const ip = req.socket.remoteAddress ?? "unknown";
      authLimiter.check(`register:${ip}`);
      const { username, password, inviteCode } = body as {
        username?: string;
        password?: string;
        inviteCode?: string;
      };
      if (!username) throw new ApiError("username is required");
      if (!password) throw new ApiError("password is required");
      if (!inviteCode) throw new ApiError("inviteCode is required");
      return this.bot.register(username, password, inviteCode);
    }

    if (method === "POST" && path === "/auth/login") {
      const ip = req.socket.remoteAddress ?? "unknown";
      authLimiter.check(`login:${ip}`);
      const { username, password } = body as {
        username?: string;
        password?: string;
      };
      if (!username || !password) throw new ApiError("username and password required");
      return this.bot.userLogin(username, password);
    }

    if (method === "GET" && path === "/auth/me") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      return this.bot.getUserInfo(token);
    }

    // ── Character 路由 ────────────────────────────────────

    if (method === "POST" && path === "/char/attach") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      const { entityId, inviteCode } = body as { entityId?: string; inviteCode?: string };
      if (!entityId) throw new ApiError("entityId is required");
      return this.bot.attachCharacterForUser(token, entityId, inviteCode);
    }

    if (method === "GET" && path === "/char/list") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      const info = this.bot.getUserInfo(token);
      return { characters: info.characters };
    }

    if (method === "POST" && path === "/char/delete") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      const { entityId } = body as { entityId?: string };
      if (!entityId) throw new ApiError("entityId is required");
      return this.bot.deleteCharacterForUser(token, entityId);
    }

    // ── Bot 路由 ─────────────────────────────────────────

    if (method === "POST" && path === "/bot/generate-attach-token") {
      const { entityId, inviteCode } = body as {
        entityId?: string;
        inviteCode?: string;
      };
      if (!entityId) throw new ApiError("entityId is required");
      const attachToken = this.bot.generateAttachToken(entityId, inviteCode);
      return { attachToken };
    }

    if (method === "POST" && path === "/bot/attach") {
      const { entityId, attachToken } = body as {
        entityId?: string;
        attachToken?: string;
      };
      if (!entityId) throw new ApiError("entityId is required");
      if (!attachToken) throw new ApiError("attachToken is required");
      return this.bot.attachEntity(entityId, attachToken);
    }

    if (method === "POST" && path === "/bot/login") {
      const { secret } = body as { secret?: string };
      if (!secret) throw new ApiError("secret is required");
      return this.bot.authenticate(secret);
    }

    if (method === "POST" && path === "/bot/resolve") {
      const { secret } = body as { secret?: string };
      if (!secret) throw new ApiError("secret is required");
      const entityId = this.bot.resolveEntityId(secret);
      return { entityId };
    }

    if (method === "GET" && path === "/bot/session") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      return this.bot.getSession(token);
    }

    if (method === "POST" && path === "/bot/chat") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      const { message } = body as { message: string };
      if (!message) throw new ApiError("message is required");
      return await this.bot.chat(token, message);
    }

    if (method === "POST" && path === "/bot/act") {
      const token = this.extractToken(req!);
      if (!token) throw new ApiError("Missing Authorization token");
      const { action, targetId } = body as { action: string; targetId?: string };
      if (!action) throw new ApiError("action is required");
      return this.bot.performAction(token, action, targetId);
    }

    // ── Agent Relay 路由 ─────────────────────────────────

    if (method === "POST" && path === "/agent/heartbeat") {
      const { entityId } = body as { entityId?: string };
      if (!entityId) throw new ApiError("entityId is required");
      this.requireAgentSecret(req, entityId);
      const pendingChats = this.bot.relay.heartbeat(entityId);
      return { ok: true, pendingChats };
    }

    if (method === "POST" && path === "/agent/chat-reply") {
      // chat-reply 使用 chatId，无法直接映射到 entityId
      // 仍需 agent secret header 存在作为基本校验
      const secret = this.extractAgentSecret(req);
      if (!secret) throw new ApiError("Agent secret required (X-Agent-Secret header)");
      const { chatId, reply, suggestedActions, entityStatus } = body as {
        chatId?: string;
        reply?: string;
        suggestedActions?: Array<{ action: string; targetId?: string; description: string }>;
        entityStatus?: Record<string, unknown>;
      };
      if (!chatId) throw new ApiError("chatId is required");
      if (!reply) throw new ApiError("reply is required");
      const resolved = this.bot.relay.resolveChat(chatId, {
        reply,
        suggestedActions,
        entityStatus,
      });
      return { ok: resolved };
    }

    if (method === "GET" && path === "/agent/status") {
      return { onlineAgents: this.bot.relay.getOnlineAgents() };
    }

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
    let totalSize = 0;
    req.on("data", (c: Buffer) => {
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large (max 1MB)"));
        return;
      }
      chunks.push(c);
    });
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
