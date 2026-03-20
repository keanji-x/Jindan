// ============================================================
// DevourSystem — 吞噬 (PvE / PvP) with equation solver
//
// v3: Delegates particle accounting to EquationSolver.
// No more hardcoded 80/20 — the equation itself produces it.
// ============================================================

import { solve } from "../engine/EquationSolver.js";
import { UNIVERSE } from "../engine/index.js";
import type { ActionHandler } from "../entity/actions/types.js";

export const doDevour: ActionHandler = (entity, _actionId, context) => {
  const { actionCost, ambientPool, tick, events, target } = context;
  if (!target) return { success: false, reason: "必须指定要吞噬的目标" };
  if (target.status !== "alive") return { success: false, reason: "目标不存在或已消亡" };

  const attackerTank = entity.components.tank;
  const attackerCombat = entity.components.combat;
  const attackerCult = entity.components.cultivation;
  const targetTank = target.components.tank;
  const targetCombat = target.components.combat;
  const targetCult = target.components.cultivation;

  if (
    !attackerTank ||
    !attackerCombat ||
    !targetTank ||
    !targetCombat ||
    !attackerCult ||
    !targetCult
  ) {
    return { success: false, reason: "实体缺失必要组件(Tank, Combat, Cultivation)" };
  }

  // Action cost: core particle → ambient
  const core = attackerTank.coreParticle;
  if ((attackerTank.tanks[core] ?? 0) <= actionCost) {
    return { success: false, reason: "灵气不足以发动吞噬" };
  }
  attackerTank.tanks[core] = (attackerTank.tanks[core] ?? 0) - actionCost;
  ambientPool.pools[core] = (ambientPool.pools[core] ?? 0) + actionCost;

  // Combat resolution (sigmoid)
  const k = UNIVERSE.devourPowerScaling;
  const winProb = 1 / (1 + Math.exp(-k * (attackerCombat.power - targetCombat.power)));
  const attackerWins = Math.random() < winProb;

  const winner = attackerWins ? entity : target;
  const loser = attackerWins ? target : entity;
  const winnerTank = attackerWins ? attackerTank : targetTank;
  const loserTank = attackerWins ? targetTank : attackerTank;

  const crossSpecies = attackerTank.coreParticle !== targetTank.coreParticle;
  const winnerReactor = UNIVERSE.reactors[winner.species]!;

  // Select equation based on cross/same species
  const eqId = crossSpecies ? winnerReactor.devourCrossEq : winnerReactor.devourSameEq;
  const eq = UNIVERSE.equations[eqId]!;

  // The loser's total core particles become the "food"
  const loserCore = loserTank.coreParticle;
  const loserTotal = loserTank.tanks[loserCore] ?? 0;

  // Calculate scale: how many times to run the equation
  // For cross-species: input has the non-core particle of the winner
  // We scale based on the total food available
  const nonCoreInEq = Object.entries(eq.input).find(([pid]) => pid !== winnerTank.coreParticle);

  let scale: number;
  if (nonCoreInEq && crossSpecies) {
    // Cross-species: scale by how much non-core (food) is available
    scale = loserTotal / nonCoreInEq[1];
  } else {
    // Same-species: scale by how much core (food) is available
    const inputKey = Object.keys(eq.input)[0]!;
    scale = loserTotal / eq.input[inputKey]!;
  }
  scale = Math.floor(scale);
  if (scale <= 0) scale = 1;

  // Temporarily move loser's particles into winner's tanks for the reaction
  // (Winner's reactor "digests" the food)
  for (const [pid, amount] of Object.entries(loserTank.tanks)) {
    winnerTank.tanks[pid] = (winnerTank.tanks[pid] ?? 0) + amount;
  }

  // Run the equation through the solver
  const result = solve(
    eq,
    scale,
    { particles: winnerTank.tanks },
    { particles: ambientPool.pools },
    winnerTank.coreParticle,
  );

  // Cap core particle to maxTanks
  const winnerCoreMax = winnerTank.maxTanks[winnerTank.coreParticle] ?? Infinity;
  const winnerCoreNow = winnerTank.tanks[winnerTank.coreParticle] ?? 0;
  if (winnerCoreNow > winnerCoreMax) {
    const overflow = winnerCoreNow - winnerCoreMax;
    winnerTank.tanks[winnerTank.coreParticle] = winnerCoreMax;
    ambientPool.pools[winnerTank.coreParticle] =
      (ambientPool.pools[winnerTank.coreParticle] ?? 0) + overflow;
  }

  // Loser dies: clear all tanks (particles already moved to winner)
  loserTank.tanks = Object.fromEntries(UNIVERSE.particles.map((p) => [p.id, 0]));
  loser.status = "lingering";

  const actualGain = result.success ? Math.abs(result.deltas[winnerTank.coreParticle] ?? 0) : 0;
  const _totalFlow = actionCost + result.totalFlow;

  events.emit({
    tick,
    type: "entity_devoured",
    data: {
      winner: { id: winner.id, name: winner.name, species: winner.species },
      loser: { id: loser.id, name: loser.name, species: loser.species },
      qiGained: actualGain,
      qiReturned: result.totalFlow - actualGain,
      crossSpecies,
      winProb,
      equation: eqId,
    },
    message: `⚔️「${winner.name}」吞噬了「${loser.name}」！夺取灵气 ${actualGain}（散溢 ${Math.floor(result.totalFlow - actualGain)}）[${eq.name}]`,
  });

  events.emit({
    tick,
    type: "entity_died",
    data: {
      id: loser.id,
      name: loser.name,
      species: loser.species,
      cause: `被「${winner.name}」吞噬`,
    },
    message: `💀「${loser.name}」被「${winner.name}」吞噬身亡`,
  });

  return { success: true, winner: winner.id, loser: loser.id, absorbed: actualGain };
};
