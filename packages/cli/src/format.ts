// ============================================================
// CLI Output Formatters — human-readable AND AI-parseable
// ============================================================

type Obj = Record<string, unknown>;

export function formatWorld(world: Obj): string {
  const res = world.resources as Obj;
  const vein = res.spiritVein as Obj;
  const qi = res.ambientQi as Obj;
  const cultivators = (world.cultivators as Obj[]) ?? [];
  const beasts = (world.beasts as Obj[]) ?? [];

  return `
┌─── 🌍 世界状态 ─── Tick ${world.tick} ───┐

  灵脉: ${vein.grade}品 │ 储量 ${vein.remaining}/${vein.maxCapacity} │ 产出 ${vein.outputPerTick}/tick
  灵气: ${qi.current}/${qi.capacity}
  无主灵石: ${res.unclaimedStones}

  修士: ${cultivators.length} 人
  妖兽: ${beasts.length} 只

└──────────────────────────────────┘`;
}

export function formatCultivator(c: Obj): string {
  return `
┌─── 🧘 ${c.name} (${c.id}) ───┐

  境界: ${c.realm} 阶 │ 战力: ${c.power}
  经验: ${c.exp}/${c.expToNext}
  灵力: ${c.qi}/${c.maxQi}
  灵石: ${c.spiritStones}
  年龄: ${c.age}/${c.lifespan} (${c.alive ? "存活" : "已陨落"})

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

export function formatBeasts(beasts: Obj[]): string {
  if (beasts.length === 0) return "  (没有妖兽)";

  let output = "\n┌─── 🐉 妖兽列表 ───┐\n\n";
  for (const b of beasts) {
    output += `  ${b.id} │ ${b.name} │ 战力 ${b.power} │ 妖丹 ${b.coreSpiritStones} 灵石\n`;
  }
  output += "\n└────────────────────┘";
  return output;
}

export function formatLeaderboard(entries: Obj[]): string {
  if (entries.length === 0) return "  (暂无修士)";

  let output = "\n┌─── 🏆 排行榜 ───┐\n\n";
  for (const e of entries) {
    output += `  #${e.rank} ${e.name} │ ${e.realm}阶 │ 战力 ${e.power} │ 灵石 ${e.spiritStones}\n`;
  }
  output += "\n└──────────────────┘";
  return output;
}
