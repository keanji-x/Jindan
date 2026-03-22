// ============================================================
// ApiClient — CLI HTTP client with auth support
// ============================================================

import type { ActionId } from "@jindan/core";

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret?: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.secret) headers["X-Agent-Secret"] = this.secret;

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

  // ── World ──────────────────────────────────────────────

  getWorldStatus() {
    return this.request<Record<string, unknown>>("GET", "/world/status");
  }

  // ── Entity ─────────────────────────────────────────────

  getSnapshot(id: string, lastThoughts: unknown[] = []) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/snapshot`, {
      lastThoughts,
    });
  }

  postReport(id: string, text: string) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/report`, { text });
  }

  // ── Unified Action ─────────────────────────────────────

  performAction(entityId: string, action: ActionId, targetId?: string, payload?: unknown) {
    return this.request<Record<string, unknown>>("POST", "/action", {
      entityId,
      action,
      targetId,
      payload,
    });
  }

  // ── Tomb System ────────────────────────────────────────

  getStatus(id: string) {
    return this.request<Record<string, unknown>>("GET", `/entity/${id}/status`);
  }

  performTomb(id: string, epitaph?: string) {
    return this.request<Record<string, unknown>>(
      "POST",
      `/entity/${id}/tomb`,
      epitaph ? { epitaph } : undefined,
    );
  }

  reincarnate(id: string, name: string, species: string) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/reincarnate`, {
      name,
      species,
    });
  }

  // ── Self resolution ────────────────────────────────────

  /** 通过 secret 解析自己的 entityId（不需要传 id） */
  async getSelf(): Promise<string> {
    if (!this.secret) throw new Error("JINDAN_SECRET 未配置，无法识别自己的身份");
    const res = await this.request<{ entityId: string }>("POST", "/bot/resolve", {
      secret: this.secret,
    });
    return res.entityId;
  }

  // ── Query ──────────────────────────────────────────────

  getEntities() {
    return this.request<Record<string, unknown>[]>("GET", "/entities");
  }

  getLeaderboard() {
    return this.request<Record<string, unknown>[]>("GET", "/leaderboard");
  }
}
