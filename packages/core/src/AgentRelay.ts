// ============================================================
// AgentRelay — 心跳追踪 + 聊天消息中继
//
// Core 不再直接调用 LLM，而是作为消息中转站：
// 1. Agent 通过心跳注册在线状态
// 2. 用户 Chat 消息入队等待 Agent 取走
// 3. Agent 处理完后通过 reply 端点返回结果
// ============================================================

import { randomBytes } from "node:crypto";

// ── Types ───────────────────────────────────────────────

export interface PendingChatRequest {
  chatId: string;
  message: string;
}

export interface ChatReply {
  reply: string;
  suggestedActions?: Array<{ action: string; targetId?: string; description: string }>;
  entityStatus?: Record<string, unknown>;
}

interface PendingChat {
  chatId: string;
  entityId: string;
  message: string;
  resolve: (reply: ChatReply) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ── AgentRelay ──────────────────────────────────────────

const HEARTBEAT_TIMEOUT_MS = 5_000; // 5 秒无心跳 → 离线
const CHAT_REPLY_TIMEOUT_MS = 30_000; // 30 秒等不到 Agent 回复 → 超时

export class AgentRelay {
  /** entityId → 最后心跳时间戳 */
  private readonly heartbeats = new Map<string, number>();
  /** chatId → 待处理的聊天请求 */
  private readonly pendingChats = new Map<string, PendingChat>();

  /** Agent 是否在线 (5 秒内有心跳) */
  isOnline(entityId: string): boolean {
    const last = this.heartbeats.get(entityId);
    if (!last) return false;
    return Date.now() - last < HEARTBEAT_TIMEOUT_MS;
  }

  /** 获取所有在线 Agent 的 entityId 列表 */
  getOnlineAgents(): string[] {
    const now = Date.now();
    const online: string[] = [];
    for (const [entityId, ts] of this.heartbeats) {
      if (now - ts < HEARTBEAT_TIMEOUT_MS) online.push(entityId);
    }
    return online;
  }

  /**
   * Agent 心跳：更新时间戳，返回待处理的 Chat 消息
   * 注意：返回后这些消息仍保留在队列中，直到 Agent 调用 resolveChat
   */
  heartbeat(entityId: string): PendingChatRequest[] {
    this.heartbeats.set(entityId, Date.now());

    const pending: PendingChatRequest[] = [];
    for (const [, chat] of this.pendingChats) {
      if (chat.entityId === entityId) {
        pending.push({ chatId: chat.chatId, message: chat.message });
      }
    }
    return pending;
  }

  /**
   * 用户发起 Chat → 入队等待 Agent 取走处理
   * 如果 Agent 离线，立即 reject
   */
  enqueueChat(entityId: string, message: string): Promise<ChatReply> {
    if (!this.isOnline(entityId)) {
      return Promise.reject(new Error("角色离线，灵识无法触达。请等待灵识上线后再试。"));
    }

    const chatId = `chat_${Date.now()}_${randomBytes(4).toString("hex")}`;

    return new Promise<ChatReply>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingChats.delete(chatId);
        reject(new Error("等待回复超时，灵识可能已断开"));
      }, CHAT_REPLY_TIMEOUT_MS);

      this.pendingChats.set(chatId, {
        chatId,
        entityId,
        message,
        resolve,
        reject,
        timeout,
      });
    });
  }

  /**
   * Agent 回传 LLM 处理结果 → resolve 对应的 Promise
   */
  resolveChat(chatId: string, reply: ChatReply): boolean {
    const chat = this.pendingChats.get(chatId);
    if (!chat) return false;

    clearTimeout(chat.timeout);
    this.pendingChats.delete(chatId);
    chat.resolve(reply);
    return true;
  }
}
