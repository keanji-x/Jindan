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
import type { StorageBackend } from "./storage/StorageBackend.js";
import type { ActionId } from "./world/types.js";
import type { World } from "./world/World.js";

// ── JWT 密钥 ──────────────────────────────────────────────
const JWT_EXPIRES_IN = "7d";

// ── 邀请码保护 ────────────────────────────────────────────
const INVITE_CODE = process.env.INVITE_CODE;
if (!INVITE_CODE) {
  console.warn("⚠️  INVITE_CODE 未设置，注册接口对所有人开放。生产环境请务必设置！");
}

// ── 简易频率限制 ──────────────────────────────────────────
const _RATE_LIMIT_WINDOW_MS = 60_000; // 1 分钟
const _RATE_LIMIT_MAX = 10; // 每分钟最多 10 次创建
const _loginTimestamps: number[] = [];

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
  private readonly attachTickets = new Map<string, { entityId: string; expiresAt: number }>();

  constructor(world: World, storage: StorageBackend) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "⚠️  JWT_SECRET 未设置！生产环境请在 .env 中配置，" +
          "开发模式请使用 DATABASE_URL=memory 自动生成。",
      );
    }
    this.jwtSecret = secret;
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
        };
      })
      .filter((c) => c.name !== "未知"); // skip dead/missing entities

    return { username, characters };
  }

  /** 以用户身份夺舍现有生物 */
  attachCharacterForUser(
    userToken: string,
    entityId: string,
    inviteCode?: string,
  ): { entityId: string; secret: string; entity: Record<string, unknown> } {
    const { username } = this.verifyUserToken(userToken);
    const user = this.storage.getUser(username);
    if (!user) throw new Error("用户不存在");

    // 生成一次性夺舍 Token，这也会校验 inviteCode
    const attachToken = this.generateAttachToken(entityId, inviteCode);

    // 执行夺舍
    const result = this.attachEntity(entityId, attachToken);

    // 绑定到用户
    if (!user.entityIds.includes(result.entityId)) {
      user.entityIds.push(result.entityId);
      this.storage.setUser(username, user);
    }

    return result;
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

  /**
   * 生成一个有时效性的 Attach Token (默认 5 分钟有效)
   * 前端/管理员可以调用此方法，将生成的 token 交给外部 LLM
   */
  generateAttachToken(entityId: string, inviteCode?: string, expiresInMs = 5 * 60 * 1000): string {
    if (INVITE_CODE && inviteCode !== INVITE_CODE) {
      throw new Error("邀请码错误或缺失");
    }
    const entity = this.world.getEntity(entityId);
    if (!entity) throw new Error("找不到该实体");
    if (entity.status !== "alive") throw new Error("该实体无法连接 (已死亡或封印)");

    // 清理过期 ticket 防止内存泄漏
    const now = Date.now();
    for (const [k, v] of this.attachTickets.entries()) {
      if (v.expiresAt < now) this.attachTickets.delete(k);
    }

    const attachToken = `att_${randomBytes(12).toString("hex")}`;
    this.attachTickets.set(attachToken, {
      entityId,
      expiresAt: now + expiresInMs,
    });
    return attachToken;
  }

  /**
   * 收编/夺舍已有确切实体的控制权 (供外部 LLM Agent 凭票接管)
   */
  attachEntity(
    entityId: string,
    attachToken: string,
  ): {
    entityId: string;
    secret: string;
    entity: Record<string, unknown>;
  } {
    // 校验 Token 窗口机制
    if (!attachToken) throw new Error("缺少 attachToken");
    const ticket = this.attachTickets.get(attachToken);
    if (!ticket) throw new Error("无效的 attachToken");
    if (ticket.entityId !== entityId) throw new Error("attachToken 与目标实体不匹配");
    if (ticket.expiresAt < Date.now()) {
      this.attachTickets.delete(attachToken);
      throw new Error("attachToken 已过期");
    }

    // 阅后即焚
    this.attachTickets.delete(attachToken);

    const entity = this.world.getEntity(entityId);
    if (!entity) throw new Error("找不到该实体");
    if (entity.status !== "alive") throw new Error("该实体无法连接 (已死亡或封印)");

    // 如果该目标实体原本没有 AI 组件挂载，则默认塞入一个标记，表明它现在受外置大脑驱动
    if (!entity.components.brain) {
      entity.components.brain = { id: "external_llm" };
    }

    // 生成接管私钥: jd_ + 24 字符随机 hex
    const secret = `jd_${randomBytes(12).toString("hex")}`;
    const hashed = this.hashSecret(secret);

    // 强制覆盖旧有绑定的私钥，完成夺舍
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
