// ============================================================
// ApiClient — v2: HTTP client wrapping the unified action API
// ============================================================

import type { ActionId } from "@jindan/core";

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
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

  createEntity(name: string, species: string) {
    return this.request<Record<string, unknown>>("POST", "/entity/create", {
      name,
      species,
    });
  }

  getEntity(id: string) {
    return this.request<Record<string, unknown>>("GET", `/entity/${id}`);
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
    return this.request<Record<string, unknown>>("GET", `/entity/${id}/status`);
  }

  performTomb(id: string) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/tomb`);
  }

  reincarnate(id: string, name: string, species: string) {
    return this.request<Record<string, unknown>>("POST", `/entity/${id}/reincarnate`, {
      name,
      species,
    });
  }

  // ── Query ──────────────────────────────────────────────

  getEntities() {
    return this.request<Record<string, unknown>[]>("GET", "/entities");
  }

  getLeaderboard() {
    return this.request<Record<string, unknown>[]>("GET", "/leaderboard");
  }
}
