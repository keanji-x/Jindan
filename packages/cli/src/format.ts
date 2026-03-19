// ============================================================
// CLI Output Formatters — v3: TankComponent model, no `any`
// ============================================================

// ── Typed shapes for API responses ────────────────────────

interface TankData {
  tanks?: Record<string, number>;
  maxTanks?: Record<string, number>;
  coreParticle?: string;
}

interface ComponentsData {
  tank?: TankData;
  qi?: { current?: number; max?: number };
  combat?: { power?: number };
  cultivation?: { realm?: number };
}

interface EntityData {
  id: string;
  name: string;
  species: string;
  alive: boolean;
  rank?: number;
  components?: ComponentsData;
}

interface PoolData {
  pools?: Record<string, number>;
  current?: number;
  total?: number;
}

interface WorldData {
  tick: number;
  ambientPool?: PoolData;
  ambientQi?: PoolData;
  entities?: EntityData[];
}

interface EventData {
  message: string;
}

interface ActionData {
  action: string;
  description: string;
  possible: boolean;
  reason?: string;
}

interface ActionResultData {
  success: boolean;
  tick: number;
  error?: string;
  reason?: string;
  events?: EventData[];
  availableActions?: ActionData[];
}

// ── Helpers ───────────────────────────────────────────────

const SPECIES_EMOJI: Record<string, string> = {
  human: "🧘",
  beast: "🐉",
  plant: "🌿",
};

function getStats(e: EntityData) {
  const c = e.components ?? {};
  const tank = c.tank;
  const core = tank?.coreParticle ?? "ql";
  return {
    realm: c.cultivation?.realm ?? "?",
    power: c.combat?.power ?? "?",
    qi: tank?.tanks?.[core] ?? c.qi?.current ?? "?",
    maxQi: tank?.maxTanks?.[core] ?? c.qi?.max ?? "?",
  };
}

// ── Formatters ────────────────────────────────────────────

export function formatWorld(world: WorldData): string {
  const pool = world.ambientPool ?? world.ambientQi;

  let ambientStr: string;
  if (pool?.pools) {
    const parts = Object.entries(pool.pools)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    ambientStr = `${parts} / 总量 ${pool.total}`;
  } else {
    ambientStr = `${pool?.current} / ${pool?.total}`;
  }

  const entities = world.entities ?? [];
  const humans = entities.filter((e) => e.species === "human");
  const beasts = entities.filter((e) => e.species === "beast");
  const plants = entities.filter((e) => e.species === "plant");

  return `
┌─── 🌍 天地气象 ─── Tick ${world.tick} ───┐

  天地灵气: ${ambientStr}
  修士: ${humans.length} 人
  妖兽: ${beasts.length} 只
  灵植: ${plants.length} 株

└──────────────────────────────────┘`;
}

export function formatEntity(e: EntityData): string {
  const emoji = SPECIES_EMOJI[e.species] ?? "❓";
  const speciesName =
    ({ human: "修士", beast: "妖兽", plant: "灵植" } as Record<string, string>)[e.species] ?? "???";
  const { realm, power, qi, maxQi } = getStats(e);

  return `
┌─── ${emoji} ${e.name} (${e.id}) ───┐

  种族: ${speciesName} │ 境界: ${realm} 阶 │ 战力: ${power}
  灵气: ${qi}/${maxQi} (${e.alive ? "存活" : "已消亡"})

└────────────────────────────────┘`;
}

export function formatActionResult(result: ActionResultData): string {
  const events = result.events ?? [];
  const actions = result.availableActions ?? [];

  let output = result.success ? "✅ 行动成功" : `❌ ${result.error || result.reason || "行动失败"}`;
  output += ` │ Tick ${result.tick}\n`;

  if (events.length > 0) {
    output += "\n  📜 事件:\n";
    for (const e of events) {
      output += `    ${e.message}\n`;
    }
  }

  if (actions.length > 0) {
    output += "\n  🎯 可用动作:\n";
    for (const a of actions) {
      const mark = a.possible ? "✓" : "✗";
      output += `    [${mark}] ${a.action}: ${a.description}`;
      if (!a.possible && a.reason) output += ` (${a.reason})`;
      output += "\n";
    }
  }

  return output;
}

export function formatEntities(entities: EntityData[]): string {
  if (entities.length === 0) return "  (天地无生灵)";

  let output = "\n┌─── 🌍 万灵录 ───┐\n\n";
  for (const e of entities) {
    const emoji = SPECIES_EMOJI[e.species] ?? "❓";
    const { realm, power, qi, maxQi } = getStats(e);
    output += `  ${emoji} ${e.id} │ ${e.name} │ ${realm}阶 │ 战力 ${power} │ 灵气 ${qi}/${maxQi}\n`;
  }
  output += "\n└────────────────────┘";
  return output;
}

export function formatLeaderboard(entries: EntityData[]): string {
  if (entries.length === 0) return "  (暂无生灵)";

  let output = "\n┌─── 🏆 排行榜 ───┐\n\n";
  for (const e of entries) {
    const emoji = SPECIES_EMOJI[e.species] ?? "❓";
    const { realm, power, qi, maxQi } = getStats(e);
    output += `  #${e.rank} ${emoji} ${e.name} │ ${realm}阶 │ 战力 ${power} │ 灵气 ${qi}/${maxQi}\n`;
  }
  output += "\n└──────────────────┘";
  return output;
}
