// ============================================================
// API Client — typed fetch wrapper for backend
// ============================================================

const BASE = "";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

// ── Characters (匿名夺舍) ───────────────────────────────

export interface CharacterInfo {
  entityId: string;
  name: string;
  species: string;
  secret?: string; // only returned on create
  realm?: number;
  qi?: number;
  maxQi?: number;
  power?: number;
}

/** 匿名夺舍 — 无需登录，直接夺舍 */
export function charAttach(entityId: string, inviteCode: string = "") {
  return request<{ entityId: string; secret: string; entity: Record<string, unknown> }>(
    "POST",
    "/char/attach",
    { entityId, inviteCode },
  );
}

// ── Bot (Chat) ──────────────────────────────────────────

export interface BotLoginResponse {
  token: string;
  entityId: string;
  entity: Record<string, unknown>;
}

export function botLogin(secret: string) {
  return request<BotLoginResponse>("POST", "/bot/login", { secret });
}

export interface ChatResponse {
  reply: string;
  suggestedActions?: { action: string; targetId?: string; description: string }[];
  entityStatus?: Record<string, unknown>;
}

export function botChat(botToken: string, message: string) {
  return request<ChatResponse>("POST", "/bot/chat", { message }, botToken);
}

export function botAct(botToken: string, action: string, targetId?: string) {
  return request<Record<string, unknown>>("POST", "/bot/act", { action, targetId }, botToken);
}

export function botSession(botToken: string) {
  return request<Record<string, unknown>>("GET", "/bot/session", undefined, botToken);
}

// ── World ───────────────────────────────────────────────

export interface EntityComponents {
  tank?: {
    coreParticle?: string;
    tanks?: Record<string, number>;
  };
  cultivation?: {
    realm?: number;
    currentQi?: number;
  };
}

export interface EntityData {
  id: string;
  name: string;
  species?: string;
  status?: string;
  components?: EntityComponents;
}

export interface WorldStatus {
  tick?: number;
  daoTanks?: Record<string, number>;
  entities?: EntityData[];
}

export interface GraveyardLife {
  name?: string;
  species?: string;
  status?: string;
  epitaph?: string;
}

export interface GraveyardGroup {
  soulId?: string;
  lives?: GraveyardLife[];
  name?: string;
  species?: string;
  status?: string;
  epitaph?: string;
}

export function getEntities() {
  return request<EntityData[]>("GET", "/entities");
}

// ── Relations ───────────────────────────────────────────

export interface RelationEdge {
  score: number;
  tags: string[];
}

/** key format: "entityA:entityB" → RelationEdge */
export function getRelations() {
  return request<Record<string, RelationEdge>>("GET", "/relations");
}

export function getWorldStatus() {
  return request<WorldStatus>("GET", "/world/status");
}

export function getGraveyard() {
  return request<GraveyardGroup[]>("GET", "/graveyard");
}

// ── Chronicle ───────────────────────────────────────────

export interface ChronicleEntry {
  tick: number;
  headline: string;
  body: string;
  intensity: number;
  involvedIds: string[];
}

export function getChronicle() {
  return request<ChronicleEntry[]>("GET", "/chronicle");
}
