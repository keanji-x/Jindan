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

// ── Auth ────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: { username: string };
}

export function authRegister(username: string, password: string, inviteCode: string) {
  return request<AuthResponse>("POST", "/auth/register", { username, password, inviteCode });
}

export function authLogin(username: string, password: string) {
  return request<AuthResponse>("POST", "/auth/login", { username, password });
}

export function authMe(token: string) {
  return request<{ username: string; characters: CharacterInfo[] }>(
    "GET",
    "/auth/me",
    undefined,
    token,
  );
}

// ── Characters ──────────────────────────────────────────

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

export function charAttach(token: string, entityId: string, inviteCode: string = "") {
  return request<{ entityId: string; secret: string; entity: Record<string, unknown> }>(
    "POST",
    "/char/attach",
    { entityId, inviteCode },
    token,
  );
}

export function charList(token: string) {
  return request<{ characters: CharacterInfo[] }>("GET", "/char/list", undefined, token);
}

export function charDelete(token: string, entityId: string) {
  return request<{ success: boolean }>("POST", "/char/delete", { entityId }, token);
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
    maxTanks?: Record<string, number>;
  };
  cultivation?: {
    realm?: number;
    currentQi?: number;
  };
  combat?: {
    power?: number;
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
  ambientPool?: {
    pools?: Record<string, number>;
  };
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

export function getWorldStatus() {
  return request<WorldStatus>("GET", "/world/status");
}

export function getGraveyard() {
  return request<GraveyardGroup[]>("GET", "/graveyard");
}
