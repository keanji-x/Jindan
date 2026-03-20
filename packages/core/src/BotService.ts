// ============================================================
// BotService — 用户账户 + 角色认证服务
//
// 管理用户注册/登录、角色创建/私钥认证、JWT session
// LLM 聊天已迁移至 Agent 端处理 (通过 AgentRelay 中继)
// ============================================================

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AgentRelay, type ChatReply } from "./AgentRelay.js";
import type { ActionId } from "./entity/types.js";
import type { StorageBackend } from "./storage/StorageBackend.js";
import type { World } from "./world/World.js";

// ── JWT 密钥 ──────────────────────────────────────────────
const _jwtRaw = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

// ── 邀请码保护 ────────────────────────────────────────────
const INVITE_CODE = process.env.INVITE_CODE;
if (!INVITE_CODE) {
  console.warn("⚠️  INVITE_CODE 未设置，注册接口对所有人开放。生产环境请务必设置！");
}

// ── 简易频率限制 ──────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 分钟
const RATE_LIMIT_MAX = 10; // 每分钟最多 10 次创建
const loginTimestamps: number[] = [];

// ── Session payload ───────────────────────────────────────
interface SessionPayload {
  entityId: string;
  name: string;
  species: string;
}

interface UserPayload {
  username: string;
  type: "user";
}

export class BotService {
  private readonly world: World;
  private readonly storage: StorageBackend;
  readonly relay: AgentRelay;
  private readonly jwtSecret: string;

  constructor(world: World, storage: StorageBackend) {
    if (!_jwtRaw) {
      throw new Error(
        "⚠️  JWT_SECRET 环境变量未设置，拒绝启动！请在 .env 中配置，例如:\n" +
          '   JWT_SECRET="your-random-secret-at-least-32-chars"',
      );
    }
    this.jwtSecret = _jwtRaw;
    this.world = world;
    this.storage = storage;
    this.relay = new AgentRelay();
  }

  // ================================================================
  // 0. 用户账户系统
  // ================================================================

  /** hash 工具 (entity secret 用 SHA-256) */
  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  /** bcrypt password hash (cost=10) */
  private hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
  }

  /** 校验 password (兼容老 SHA-256 hash, 自动迁移) */
  private verifyPassword(password: string, stored: string, username: string): boolean {
    // bcrypt hashes start with $2a$ or $2b$
    if (stored.startsWith("$2")) {
      return bcrypt.compareSync(password, stored);
    }
    // Legacy SHA-256 fallback — auto-upgrade
    const sha = this.hashSecret(password);
    if (sha !== stored) return false;
    // Upgrade to bcrypt on successful legacy login
    const user = this.storage.getUser(username);
    if (user) {
      user.passwordHash = this.hashPassword(password);
      this.storage.setUser(username, user);
    }
    return true;
  }

  /** 注册用户 */
  register(
    username: string,
    password: string,
    inviteCode: string,
  ): {
    token: string;
    user: { username: string };
  } {
    if (INVITE_CODE && inviteCode !== INVITE_CODE) {
      throw new Error("邀请码错误");
    }
    if (!username || username.length < 2) throw new Error("用户名至少 2 个字符");
    if (!password || password.length < 4) throw new Error("密码至少 4 个字符");
    if (this.storage.hasUser(username)) throw new Error("用户名已存在");

    const passwordHash = this.hashPassword(password);
    this.storage.setUser(username, { passwordHash, entityIds: [] });

    const payload: UserPayload = { username, type: "user" };
    const token = jwt.sign(payload, this.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
    return { token, user: { username } };
  }

  /** 用户登录 */
  userLogin(
    username: string,
    password: string,
  ): {
    token: string;
    user: { username: string };
  } {
    const user = this.storage.getUser(username);
    if (!user) throw new Error("用户名或密码错误");
    if (!this.verifyPassword(password, user.passwordHash, username)) {
      throw new Error("用户名或密码错误");
    }

    const payload: UserPayload = { username, type: "user" };
    const token = jwt.sign(payload, this.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
    return { token, user: { username } };
  }

  /** 验证 User JWT */
  verifyUserToken(token: string): UserPayload {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as UserPayload;
      if (payload.type !== "user") throw new Error("Invalid user token");
      return payload;
    } catch {
      throw new Error("Invalid or expired token");
    }
  }

  /** 获取用户信息 + 角色列表 */
  getUserInfo(userToken: string): {
    username: string;
    characters: {
      entityId: string;
      name: string;
      species: string;
      realm?: number;
      power?: number;
    }[];
  } {
    const { username } = this.verifyUserToken(userToken);
    const user = this.storage.getUser(username);
    if (!user) throw new Error("用户不存在");

    const characters = user.entityIds
      .map((eid) => {
        const e = this.world.getEntity(eid);
        return {
          entityId: eid,
          name: e?.name || "未知",
          species: e?.species || "human",
          realm: e?.components?.cultivation?.realm,
          power: e?.components?.combat?.power,
        };
      })
      .filter((c) => c.name !== "未知"); // skip dead/missing entities

    return { username, characters };
  }

  /** 以用户身份创建角色 */
  createCharacterForUser(
    userToken: string,
    name: string,
    species: "human" | "beast" | "plant",
  ): { entityId: string; secret: string; entity: Record<string, unknown> } {
    const { username } = this.verifyUserToken(userToken);
    const user = this.storage.getUser(username);
    if (!user) throw new Error("用户不存在");

    // 频率限制
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    while (loginTimestamps.length > 0 && loginTimestamps[0]! < cutoff) loginTimestamps.shift();
    if (loginTimestamps.length >= RATE_LIMIT_MAX) throw new Error("创建角色过于频繁");
    loginTimestamps.push(now);

    const entity = this.world.createEntity(name, species);

    // 生成私钥
    const secret = `jd_${randomBytes(12).toString("hex")}`;
    const hashed = this.hashSecret(secret);
    this.storage.setSecret(entity.id, hashed);

    // 绑定到用户
    user.entityIds.push(entity.id);
    this.storage.setUser(username, user);

    return { entityId: entity.id, secret, entity: entity as unknown as Record<string, unknown> };
  }

  /** 以用户身份删除角色 */
  deleteCharacterForUser(userToken: string, entityId: string): { success: boolean } {
    const { username } = this.verifyUserToken(userToken);
    const user = this.storage.getUser(username);
    if (!user) throw new Error("用户不存在");

    if (!user.entityIds.includes(entityId)) {
      throw new Error("无权删除该角色或角色不存在");
    }

    // 从用户的列表中移除
    user.entityIds = user.entityIds.filter((id) => id !== entityId);
    this.storage.setUser(username, user);

    // 从存储和世界中彻底移除
    this.storage.removeEntity(entityId);

    return { success: true };
  }

  // ================================================================
  // 1. 私钥认证 (角色级)
  // ================================================================

  /** 创建新角色 → 生成 EntitySecret（私钥），只返回一次 */
  createEntity(
    name: string,
    species: "human" | "beast" | "plant",
    inviteCode?: string,
  ): {
    entityId: string;
    secret: string;
    entity: Record<string, unknown>;
  } {
    // 邀请码验证
    if (INVITE_CODE && inviteCode !== INVITE_CODE) {
      throw new Error("邀请码错误或缺失");
    }

    // 频率限制
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    while (loginTimestamps.length > 0 && loginTimestamps[0]! < cutoff) {
      loginTimestamps.shift();
    }
    if (loginTimestamps.length >= RATE_LIMIT_MAX) {
      throw new Error("创建角色过于频繁，请稍后再试");
    }
    loginTimestamps.push(now);

    const entity = this.world.createEntity(name, species);

    // 生成私钥: jd_ + 24 字符随机 hex
    const secret = `jd_${randomBytes(12).toString("hex")}`;
    const hashed = this.hashSecret(secret);
    this.storage.setSecret(entity.id, hashed);

    return { entityId: entity.id, secret, entity: entity as unknown as Record<string, unknown> };
  }

  /** 用私钥登录 → 签发 JWT session token */
  authenticate(secret: string): {
    token: string;
    entityId: string;
    entity: Record<string, unknown>;
  } {
    const hashed = this.hashSecret(secret);
    const entityId = this.storage.getEntityIdBySecret(hashed);
    if (!entityId) throw new Error("私钥无效");

    const storedHash = this.storage.getSecret(entityId);
    if (storedHash !== hashed) throw new Error("私钥无效");

    const entity = this.world.getEntity(entityId);
    if (!entity) throw new Error("角色已不存在");

    const payload: SessionPayload = {
      entityId: entity.id,
      name: entity.name,
      species: entity.species,
    };
    const token = jwt.sign(payload, this.jwtSecret, { expiresIn: JWT_EXPIRES_IN });
    return { token, entityId: entity.id, entity: entity as unknown as Record<string, unknown> };
  }

  /** 用私钥解析 entityId（给 agent 用，不签发 JWT） */
  resolveEntityId(secret: string): string {
    const hashed = this.hashSecret(secret);
    const entityId = this.storage.getEntityIdBySecret(hashed);
    if (!entityId) throw new Error("私钥无效");
    if (!this.world.getEntity(entityId)) throw new Error("角色已不存在");
    return entityId;
  }

  /** 验证 agent 操作权限：entityId 的 secret 必须匹配 */
  verifyAgentAccess(entityId: string, secret: string): void {
    const hashed = this.hashSecret(secret);
    const stored = this.storage.getSecret(entityId);
    if (!stored || stored !== hashed) {
      throw new Error("Agent 认证失败：无效的 entity secret");
    }
  }

  /** 验证 JWT → 返回 session 信息 */
  verifyToken(token: string): SessionPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as SessionPayload;
    } catch {
      throw new Error("Invalid or expired token");
    }
  }

  /** 获取 session + 实体完整状态 */
  getSession(token: string): {
    entityId: string;
    entity: Record<string, unknown> | null;
    alive: boolean;
  } {
    const session = this.verifyToken(token);
    const entity = this.world.getEntity(session.entityId);
    return {
      entityId: session.entityId,
      entity: entity as unknown as Record<string, unknown> | null,
      alive: entity?.status === "alive",
    };
  }

  // ================================================================
  // 2. 聊天 — 通过 AgentRelay 中继
  // ================================================================

  /**
   * 用户发起聊天 → 入队等待 Agent 处理
   * Agent 离线时直接报错
   */
  async chat(token: string, userMessage: string): Promise<ChatReply> {
    const session = this.verifyToken(token);
    const { entityId } = session;

    // 检查实体是否存活
    const entity = this.world.getEntity(entityId);
    if (!entity) throw new Error("Entity not found");
    if (entity.status !== "alive") {
      // 角色已死 → 不抛错，返回主题化回复，避免前端重复报错
      const statusMessages: Record<string, string> = {
        lingering: "……灵魂飘荡，意识模糊，似乎在等待什么……",
        entombed: "……墓碑上刻着往昔的故事，灵识已归于天地……",
      };
      return {
        reply: statusMessages[entity.status] ?? "……无人应答……",
        suggestedActions: [],
      };
    }

    // 通过 AgentRelay 入队
    return this.relay.enqueueChat(entityId, userMessage);
  }

  // ================================================================
  // 3. 执行行动
  // ================================================================

  performAction(token: string, action: string, targetId?: string): Record<string, unknown> {
    const session = this.verifyToken(token);
    const result = this.world.performAction(session.entityId, action as ActionId, targetId);
    return result as unknown as Record<string, unknown>;
  }

  /** 清除某个实体的聊天历史 (由 Agent 自行管理) */
  clearHistory(_entityId: string): void {
    // 聊天历史已迁移至 Agent 端管理，此方法保留兼容性
  }
}
