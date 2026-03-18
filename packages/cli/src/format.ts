// ============================================================
// CLI Output Formatters — v2: unified Entity model
// ============================================================

type Obj = Record<string, unknown>;

const SPECIES_EMOJI: Record<string, string> = {
  human: "🧘",
  beast: "🐉",
  plant: "🌿",
};

export function formatWorld(world: Obj): string {
  const qi = world.ambientQi as Obj;
  const entities = (world.entities as Obj[]) ?? [];
  const humans = entities.filter((e) => e.species === "human");
  const beasts = entities.filter((e) => e.species === "beast");
  const plants = entities.filter((e) => e.species === "plant");

  return `
┌─── 🌍 天地气象 ─── Tick ${world.tick} ───┐

  天地灵气: ${qi.current} / ${qi.total}
  修士: ${humans.length} 人
  妖兽: ${beasts.length} 只
  灵植: ${plants.length} 株

└──────────────────────────────────┘`;
}

export function formatEntity(e: Obj): string {
  const emoji = SPECIES_EMOJI[e.species as string] ?? "❓";
  const speciesName = { human: "修士", beast: "妖兽", plant: "灵植" }[e.species as string] ?? "???";

  return `
┌─── ${emoji} ${e.name} (${e.id}) ───┐

  种族: ${speciesName} │ 境界: ${e.realm} 阶 │ 战力: ${e.power}
  灵气: ${e.qi}/${e.maxQi} (${e.alive ? "存活" : "已消亡"})
  灵石: ${e.spiritStones}

└────────────────────────────────┘`;
}

export function formatActionResult(result: Obj): string {
  const events = (result.events as Obj[]) ?? [];
  const actions = (result.availableActions as Obj[]) ?? [];

  let output = result.success ? "✅ 行动成功" : `❌ ${result.error ?? "行动失败"}`;
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

export function formatEntities(entities: Obj[]): string {
  if (entities.length === 0) return "  (天地无生灵)";

  let output = "\n┌─── 🌍 万灵录 ───┐\n\n";
  for (const e of entities) {
    const emoji = SPECIES_EMOJI[e.species as string] ?? "❓";
    output += `  ${emoji} ${e.id} │ ${e.name} │ ${e.realm}阶 │ 战力 ${e.power} │ 灵气 ${e.qi}/${e.maxQi}\n`;
  }
  output += "\n└────────────────────┘";
  return output;
}

export function formatLeaderboard(entries: Obj[]): string {
  if (entries.length === 0) return "  (暂无生灵)";

  let output = "\n┌─── 🏆 排行榜 ───┐\n\n";
  for (const e of entries) {
    const emoji = SPECIES_EMOJI[e.species as string] ?? "❓";
    output += `  #${e.rank} ${emoji} ${e.name} │ ${e.realm}阶 │ 战力 ${e.power} │ 灵气 ${e.qi}/${e.maxQi}\n`;
  }
  output += "\n└──────────────────┘";
  return output;
}
