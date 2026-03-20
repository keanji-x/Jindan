// ============================================================
// PgStorage — PostgreSQL 持久化存储后端
//
// 策略：运行时维护内存缓存（和 MemoryStorage 相同结构），
// flush() 时批量 UPSERT 到 PG。启动时从 PG 加载已有数据到内存。
// ============================================================

import type { Entity, QiPoolState, WorldEventRecord } from "../world/types.js";
import type { StorageBackend, UserRecord } from "./StorageBackend.js";

// Dynamic import to avoid hard dependency when using MemoryStorage
let pg: typeof import("pg") | undefined;

async function getPg() {
  if (!pg) {
    pg = await import("pg");
  }
  return pg;
}

export class PgStorage implements StorageBackend {
  private pool: InstanceType<typeof import("pg").Pool> | undefined;
  private readonly connectionString: string;

  // In-memory caches (same as MemoryStorage, flushed to PG periodically)
  private entities: Map<string, Entity> = new Map();
  private events: WorldEventRecord[] = [];
  private bySource: Map<string, WorldEventRecord[]> = new Map();
  private byTarget: Map<string, WorldEventRecord[]> = new Map();
  private qiPool: QiPoolState = { pools: {}, total: 0 };
  private tick = 0;

  // User & Secret caches
  private users: Map<string, UserRecord> = new Map();
  private secrets: Map<string, string> = new Map(); // entityId → hashedSecret
  private secretIndex: Map<string, string> = new Map(); // hashedSecret → entityId

  // Dirty tracking for efficient flush
  private dirtyEntities: Set<string> = new Set();
  private newEvents: WorldEventRecord[] = [];
  private qiPoolDirty = false;
  private tickDirty = false;
  private dirtyUsers: Set<string> = new Set();
  private dirtySecrets: Set<string> = new Set();

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  // ── Lifecycle ──────────────────────────────────────────

  async init(): Promise<void> {
    const { Pool } = await getPg();
    this.pool = new Pool({ connectionString: this.connectionString });

    // Create tables
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        soul_id TEXT NOT NULL,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'alive',
        sentient BOOLEAN NOT NULL DEFAULT true,
        life_article TEXT NOT NULL DEFAULT '',
        life_events JSONB NOT NULL DEFAULT '[]',
        components JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        tick INTEGER NOT NULL,
        source_id TEXT NOT NULL,
        target_id TEXT,
        type TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_tick ON events (tick);
      CREATE INDEX IF NOT EXISTS idx_events_source ON events (source_id);
      CREATE INDEX IF NOT EXISTS idx_events_target ON events (target_id);

      CREATE TABLE IF NOT EXISTS world_state (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        qi_pools JSONB NOT NULL DEFAULT '{}',
        qi_total INTEGER NOT NULL DEFAULT 0,
        tick INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO world_state (id, qi_pools, qi_total, tick)
      VALUES (1, '{}', 0, 0)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        entity_ids JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS entity_secrets (
        entity_id TEXT PRIMARY KEY,
        hashed_secret TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_entity_secrets_hash ON entity_secrets (hashed_secret);
    `);

    // Load existing data into memory
    await this.loadFromPg();

    console.log("[PgStorage] 初始化完成 — 已从 PostgreSQL 加载数据");
  }

  async close(): Promise<void> {
    await this.flush();
    await this.pool?.end();
    console.log("[PgStorage] 连接已关闭");
  }

  // ── Entity CRUD ────────────────────────────────────────

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  setEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    this.dirtyEntities.add(entity.id);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  removeEntity(id: string): void {
    this.entities.delete(id);
    this.dirtyEntities.add(id); // Will be handled as delete in flush
  }

  // ── Event Append / Query ───────────────────────────────

  appendEvent(event: WorldEventRecord): void {
    this.events.push(event);
    this.newEvents.push(event);

    let sourceEvents = this.bySource.get(event.sourceId);
    if (!sourceEvents) {
      sourceEvents = [];
      this.bySource.set(event.sourceId, sourceEvents);
    }
    sourceEvents.push(event);

    if (event.targetId) {
      let targetEvents = this.byTarget.get(event.targetId);
      if (!targetEvents) {
        targetEvents = [];
        this.byTarget.set(event.targetId, targetEvents);
      }
      targetEvents.push(event);
    }
  }

  getEventsBySource(sourceId: string): WorldEventRecord[] {
    return this.bySource.get(sourceId) || [];
  }

  getEventsByTarget(targetId: string): WorldEventRecord[] {
    return this.byTarget.get(targetId) || [];
  }

  getEventsByTick(startTick: number, endTick: number): WorldEventRecord[] {
    return this.events.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }

  getAllEvents(): WorldEventRecord[] {
    return this.events;
  }

  getEventCount(): number {
    return this.events.length;
  }

  compactEvents(keepCount: number): void {
    this.events = this.events.slice(-keepCount);

    // Rebuild indexes
    this.bySource.clear();
    this.byTarget.clear();

    for (const event of this.events) {
      let sourceEvents = this.bySource.get(event.sourceId);
      if (!sourceEvents) {
        sourceEvents = [];
        this.bySource.set(event.sourceId, sourceEvents);
      }
      sourceEvents.push(event);

      if (event.targetId) {
        let targetEvents = this.byTarget.get(event.targetId);
        if (!targetEvents) {
          targetEvents = [];
          this.byTarget.set(event.targetId, targetEvents);
        }
        targetEvents.push(event);
      }
    }
  }

  // ── QiPool ─────────────────────────────────────────────

  getQiPoolState(): QiPoolState {
    return this.qiPool;
  }

  setQiPoolState(state: QiPoolState): void {
    this.qiPool = state;
    this.qiPoolDirty = true;
  }

  // ── Tick ────────────────────────────────────────────────

  getTick(): number {
    return this.tick;
  }

  setTick(tick: number): void {
    this.tick = tick;
    this.tickDirty = true;
  }

  // ── User Accounts ──────────────────────────────────────

  getUser(username: string): UserRecord | undefined {
    return this.users.get(username);
  }

  setUser(username: string, record: UserRecord): void {
    this.users.set(username, record);
    this.dirtyUsers.add(username);
  }

  hasUser(username: string): boolean {
    return this.users.has(username);
  }

  // ── Entity Secrets ─────────────────────────────────────

  getSecret(entityId: string): string | undefined {
    return this.secrets.get(entityId);
  }

  setSecret(entityId: string, hashedSecret: string): void {
    this.secrets.set(entityId, hashedSecret);
    this.secretIndex.set(hashedSecret, entityId);
    this.dirtySecrets.add(entityId);
  }

  getEntityIdBySecret(hashedSecret: string): string | undefined {
    return this.secretIndex.get(hashedSecret);
  }

  // ── Persistence Flush ──────────────────────────────────

  async flush(): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Flush dirty entities
      for (const id of this.dirtyEntities) {
        const entity = this.entities.get(id);
        if (entity) {
          await client.query(
            `INSERT INTO entities (id, soul_id, name, species, status, sentient, life_article, life_events, components, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (id) DO UPDATE SET
               soul_id = $2, name = $3, species = $4, status = $5,
               sentient = $6, life_article = $7, life_events = $8,
               components = $9, updated_at = NOW()`,
            [
              entity.id,
              entity.soulId,
              entity.name,
              entity.species,
              entity.status,
              entity.sentient,
              entity.life.article,
              JSON.stringify(entity.life.events),
              JSON.stringify(entity.components),
            ],
          );
        } else {
          // Entity was removed
          await client.query("DELETE FROM entities WHERE id = $1", [id]);
        }
      }

      // 2. Flush new events (append-only)
      for (const event of this.newEvents) {
        await client.query(
          `INSERT INTO events (id, tick, source_id, target_id, type, data)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            event.id,
            event.tick,
            event.sourceId,
            event.targetId ?? null,
            event.type,
            event.data ? JSON.stringify(event.data) : null,
          ],
        );
      }

      // 3. Flush world state (qi pool + tick)
      if (this.qiPoolDirty || this.tickDirty) {
        await client.query(
          `UPDATE world_state SET qi_pools = $1, qi_total = $2, tick = $3, updated_at = NOW() WHERE id = 1`,
          [JSON.stringify(this.qiPool.pools), this.qiPool.total, this.tick],
        );
      }

      // 4. Flush dirty users
      for (const username of this.dirtyUsers) {
        const user = this.users.get(username);
        if (user) {
          await client.query(
            `INSERT INTO users (username, password_hash, entity_ids, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (username) DO UPDATE SET
               password_hash = $2, entity_ids = $3, updated_at = NOW()`,
            [username, user.passwordHash, JSON.stringify(user.entityIds)],
          );
        }
      }

      // 5. Flush dirty secrets
      for (const entityId of this.dirtySecrets) {
        const hashed = this.secrets.get(entityId);
        if (hashed) {
          await client.query(
            `INSERT INTO entity_secrets (entity_id, hashed_secret)
             VALUES ($1, $2)
             ON CONFLICT (entity_id) DO UPDATE SET hashed_secret = $2`,
            [entityId, hashed],
          );
        }
      }

      await client.query("COMMIT");

      // Clear dirty tracking
      this.dirtyEntities.clear();
      this.newEvents = [];
      this.qiPoolDirty = false;
      this.tickDirty = false;
      this.dirtyUsers.clear();
      this.dirtySecrets.clear();
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[PgStorage] flush 失败:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Private: Load from PG ──────────────────────────────

  private async loadFromPg(): Promise<void> {
    if (!this.pool) return;

    // Load entities
    const { rows: entityRows } = await this.pool.query(
      "SELECT * FROM entities ORDER BY created_at",
    );
    for (const row of entityRows) {
      const entity: Entity = {
        id: row.id,
        soulId: row.soul_id,
        name: row.name,
        species: row.species,
        status: row.status,
        sentient: row.sentient,
        life: {
          article: row.life_article,
          events: row.life_events ?? [],
        },
        components: row.components ?? {},
      };
      this.entities.set(entity.id, entity);
    }

    // Load events (most recent window only)
    const { rows: eventRows } = await this.pool.query(
      "SELECT * FROM events ORDER BY tick, created_at",
    );
    for (const row of eventRows) {
      const event: WorldEventRecord = {
        id: row.id,
        tick: row.tick,
        sourceId: row.source_id,
        targetId: row.target_id ?? undefined,
        type: row.type,
        data: row.data ?? undefined,
      };
      this.events.push(event);

      // Build indexes
      let sourceEvents = this.bySource.get(event.sourceId);
      if (!sourceEvents) {
        sourceEvents = [];
        this.bySource.set(event.sourceId, sourceEvents);
      }
      sourceEvents.push(event);

      if (event.targetId) {
        let targetEvents = this.byTarget.get(event.targetId);
        if (!targetEvents) {
          targetEvents = [];
          this.byTarget.set(event.targetId, targetEvents);
        }
        targetEvents.push(event);
      }
    }

    // Load world state
    const { rows: stateRows } = await this.pool.query("SELECT * FROM world_state WHERE id = 1");
    if (stateRows.length > 0) {
      const row = stateRows[0];
      this.qiPool = {
        pools: row.qi_pools ?? {},
        total: row.qi_total ?? 0,
      };
      this.tick = row.tick ?? 0;
    }

    // Load users
    const { rows: userRows } = await this.pool.query("SELECT * FROM users ORDER BY created_at");
    for (const row of userRows) {
      this.users.set(row.username, {
        passwordHash: row.password_hash,
        entityIds: row.entity_ids ?? [],
      });
    }

    // Load entity secrets
    const { rows: secretRows } = await this.pool.query("SELECT * FROM entity_secrets");
    for (const row of secretRows) {
      this.secrets.set(row.entity_id, row.hashed_secret);
      this.secretIndex.set(row.hashed_secret, row.entity_id);
    }

    console.log(
      `[PgStorage] 加载: ${this.entities.size} 实体, ${this.events.length} 事件, ${this.users.size} 用户, ${this.secrets.size} 密钥, tick=${this.tick}`,
    );
  }
}
