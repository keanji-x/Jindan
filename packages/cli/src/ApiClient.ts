// ============================================================
// ApiClient — HTTP client wrapping the core API
// ============================================================

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

  // ── Cultivator ─────────────────────────────────────────

  createCultivator(name: string) {
    return this.request<Record<string, unknown>>("POST", "/cultivator/create", { name });
  }

  getCultivator(id: string) {
    return this.request<Record<string, unknown>>("GET", `/cultivator/${id}`);
  }

  // ── Actions ────────────────────────────────────────────

  cultivate(cultivatorId: string) {
    return this.request<Record<string, unknown>>("POST", "/action/cultivate", { cultivatorId });
  }

  breakthrough(cultivatorId: string) {
    return this.request<Record<string, unknown>>("POST", "/action/breakthrough", { cultivatorId });
  }

  fightBeast(cultivatorId: string, beastId?: string) {
    return this.request<Record<string, unknown>>("POST", "/action/fight-beast", {
      cultivatorId,
      beastId,
    });
  }

  fightPvP(attackerId: string, defenderId: string) {
    return this.request<Record<string, unknown>>("POST", "/action/fight-pvp", {
      attackerId,
      defenderId,
    });
  }

  pickupStones(cultivatorId: string) {
    return this.request<Record<string, unknown>>("POST", "/action/pickup-stones", { cultivatorId });
  }

  // ── Query ──────────────────────────────────────────────

  getBeasts() {
    return this.request<Record<string, unknown>[]>("GET", "/beasts");
  }

  getLeaderboard() {
    return this.request<Record<string, unknown>[]>("GET", "/leaderboard");
  }
}
