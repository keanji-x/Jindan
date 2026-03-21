// ============================================================
// ApiClient — HTTP client wrapping the unified action API
// ============================================================

import type { ActionId } from "@jindan/core";

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly agentSecret?: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.agentSecret) headers["X-Agent-Secret"] = this.agentSecret;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as T & { error?: string };
    if (!res.ok || data.error) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data;
  }

  // ── Entity ─────────────────────────────────────────────

  /** 用私钥解析 entityId */
  resolveSecret(secret: string) {
    return this.request<{ entityId: string }>("POST", "/bot/resolve", { secret });
  }

  getObserve(id: string) {
    return this.request<Record<string, unknown>>("GET", `/entity/${id}/observe`);
  }

  getMemory(id: string) {
    return this.request<Record<string, unknown>>("GET", `/entity/${id}/memory`);
  }

  getPlan(id: string) {
    return this.request<Record<string, unknown>[]>("GET", `/entity/${id}/plan`);
  }

  postReport(id: string, text: string) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/report`, { text });
  }

  // ── Unified Action ─────────────────────────────────────

  performAction(entityId: string, action: ActionId, targetId?: string) {
    return this.request<Record<string, unknown>>("POST", "/action", {
      entityId,
      action,
      targetId,
    });
  }

  // ── Tomb System ────────────────────────────────────────

  getStatus(id: string) {
    return this.request<{ status: string; life: { article: string; events: string[] } }>(
      "GET",
      `/entity/${id}/status`,
    );
  }

  performTomb(id: string, epitaph?: string) {
    return this.request<{ success: boolean; epitaph?: string; error?: string }>(
      "POST",
      `/entity/${id}/tomb`,
      epitaph ? { epitaph } : undefined,
    );
  }

  reincarnate(id: string, name: string, species: string) {
    return this.request<{ success: boolean; entity?: { id: string }; error?: string }>(
      "POST",
      `/entity/${id}/reincarnate`,
      { name, species },
    );
  }

  // ── Agent Relay ───────────────────────────────────────

  /** 心跳 + 拉取待处理的用户聊天消息 */
  heartbeat(entityId: string) {
    return this.request<{
      ok: boolean;
      pendingChats: Array<{ chatId: string; message: string }>;
    }>("POST", "/agent/heartbeat", { entityId });
  }

  /** 回传 LLM 处理结果给 Core */
  chatReply(
    chatId: string,
    reply: string,
    suggestedActions?: Array<{ action: string; targetId?: string; description: string }>,
    entityStatus?: Record<string, unknown>,
  ) {
    return this.request<{ ok: boolean }>("POST", "/agent/chat-reply", {
      chatId,
      reply,
      suggestedActions,
      entityStatus,
    });
  }
}
