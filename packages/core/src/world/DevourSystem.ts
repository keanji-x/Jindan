// ============================================================
// DevourSystem — 吞噬 (PvE / PvP) with qi conservation fix
// ============================================================

import type { EventBus } from "../EventBus.js";
import type { Entity } from "../entity/types.js";
import type { ActionHandler } from "../entity/actions/types.js";
import { DEVOUR_CONFIG } from "./config.js";
import type { AmbientQi, DevourResult } from "./types.js";

export const doDevour: ActionHandler = (entity, actionId, context) => {
  const { actionCost, ambientQi, tick, events, target } = context;
  if (!target) return { success: false, reason: "必须指定要吞噬的目标" };
  if (!target.alive) {
    return { success: false, reason: "目标不存在或已消亡" };
  }

  const attackerQi = entity.components.qi;
  const attackerCombat = entity.components.combat;
  const attackerCult = entity.components.cultivation;
  const targetQi = target.components.qi;
  const targetCombat = target.components.combat;
  const targetCult = target.components.cultivation;

  if (!attackerQi || !attackerCombat || !targetQi || !targetCombat || !attackerCult || !targetCult) {
    return { success: false, reason: "实体缺失必要组件(Qi, Combat, Cultivation)" };
  }

  // Action 灵气消耗 → 回归天地
  if (attackerQi.current <= actionCost) {
    return { success: false, reason: "灵气不足以发动吞噬" };
  }
  attackerQi.current -= actionCost;
  ambientQi.current += actionCost; // 守恒

  // 计算胜率 (sigmoid)
  const k = DEVOUR_CONFIG.powerScaling;
  const winProb = 1 / (1 + Math.exp(-k * (attackerCombat.power - targetCombat.power)));
  const attackerWins = Math.random() < winProb;

  const winner = attackerWins ? entity : target;
  const loser = attackerWins ? target : entity;
  const winnerQi = attackerWins ? attackerQi : targetQi;
  const loserQi = attackerWins ? targetQi : attackerQi;
  const winnerCult = attackerWins ? attackerCult : targetCult;
  const loserCult = attackerWins ? targetCult : attackerCult;

  const crossSpecies = entity.species !== target.species;

  // 败者灵气分配 — 严格守恒
  const absorbRatio = crossSpecies
    ? DEVOUR_CONFIG.crossSpeciesAbsorb
    : DEVOUR_CONFIG.sameSpeciesAbsorb;

  const loserTotalQi = loserQi.current;
  const rawGain = Math.floor(loserTotalQi * absorbRatio);

  // 胜者实际能吸收的量 (不能超过 maxQi)
  const space = winnerQi.max - winnerQi.current;
  const actualGain = Math.min(rawGain, space);

  // 剩余全部回归天地 (包括溢出部分)
  const qiReturned = loserTotalQi - actualGain;

  // 执行转移
  winnerQi.current += actualGain;
  ambientQi.current += qiReturned; // 守恒

  // 败者死亡
  loserQi.current = 0;
  loser.alive = false;

  const flux = actionCost + actualGain + qiReturned;

  events.emit({
    tick,
    type: "entity_devoured",
    data: {
      winner: { id: winner.id, name: winner.name, species: winner.species },
      loser: { id: loser.id, name: loser.name, species: loser.species },
      qiGained: actualGain,
      qiReturned,
      crossSpecies,
      winProb,
    },
    message: `⚔️「${winner.name}」吞噬了「${loser.name}」！夺取灵气 ${actualGain}（散溢 ${qiReturned}）`,
  });

  return { success: true, winner: winner.id, loser: loser.id, absorbed: actualGain, flux };
}
