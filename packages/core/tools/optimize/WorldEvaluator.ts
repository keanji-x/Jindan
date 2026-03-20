// ============================================================
// WorldEvaluator — Fitness function for world balance assessment
//
// Scores a headless simulation on 6 dimensions.
// Standalone tool — does NOT depend on vitest.
// ============================================================

import { AiRegistry } from "../../src/world/ai/AiRegistry.js";
import { World } from "../../src/world/World.js";

export interface WorldScore {
  total: number;
  playerSurvival: number;
  speciesDiversity: number;
  breakthroughRate: number;
  ecosystemHealth: number;
  ambientEntityRatio: number;
  shaLingRatio: number;
}

export interface EvalOptions {
  ticks: number;
  maxIterations?: number;
}

export function evaluateWorld(opts: EvalOptions): WorldScore {
  const world = new World();
  const player = world.createEntity("评测者", "human");
  const playerId = player.id;

  const totalTicks = opts.ticks;
  const maxIter = opts.maxIterations ?? totalTicks * 20;

  let playerAliveTicks = 0;
  let diversitySum = 0;
  let ecosystemSum = 0;
  let breakthroughs = 0;
  let ambientEntitySum = 0;
  let shaLingSum = 0;
  let ticksSeen = 0;

  const initialEntityCount = world.getAliveEntities().length;

  world.events.onAny((e) => {
    if (e.type === "entity_breakthrough" && e.data.id === playerId) {
      breakthroughs++;
    }
  });

  let iterations = 0;
  while (world.tick < totalTicks && iterations < maxIter) {
    iterations++;

    const npcs = world.getAliveEntities().filter((e) => e.components.brain);

    for (const npc of npcs) {
      if (npc.status !== "alive") continue;
      const brain = AiRegistry.get(npc.components.brain!.id);
      if (!brain) continue;

      const actions = world.getAvailableActions(npc.id);
      if (actions.length === 0) continue;

      const tank = npc.components.tank;
      const core = tank?.coreParticle ?? "ql";
      const qiRatio = tank ? (tank.tanks[core] ?? 0) / (tank.maxTanks[core] ?? 1) : 0;
      const decision = brain.decide(actions, { qiRatio });
      if (decision) {
        world.performAction(npc.id, decision.action, decision.targetId);
      }
    }

    const playerEntity = world.getEntity(playerId);
    if (playerEntity?.status === "alive") {
      const pActions = world.getAvailableActions(playerId);
      const brk = pActions.find((a) => a.action === "breakthrough" && a.possible);
      if (brk) {
        world.performAction(playerId, "breakthrough");
      } else {
        const med = pActions.find((a) => a.action === "meditate" && a.possible);
        if (med) world.performAction(playerId, "meditate");
      }
    }

    world.settle();

    if (world.tick > ticksSeen) {
      const newTicks = world.tick - ticksSeen;
      for (let t = 0; t < newTicks; t++) {
        ticksSeen++;

        const alive = world.getAliveEntities();
        const plants = alive.filter((e) => e.species === "plant").length;
        const beasts = alive.filter((e) => e.species === "beast").length;
        const playerAlive = alive.some((e) => e.id === playerId);

        if (playerAlive) playerAliveTicks++;

        const minSpecies = Math.min(plants, beasts);
        const maxSpecies = Math.max(plants, beasts);
        diversitySum += maxSpecies > 0 ? minSpecies / maxSpecies : 0;

        ecosystemSum += alive.length / Math.max(initialEntityCount, 1);

        const snap = world.getSnapshot();
        const ambientQl = snap.ambientPool.pools.ql ?? 0;
        const ambientQs = snap.ambientPool.pools.qs ?? 0;
        const totalAmbient = ambientQl + ambientQs;
        let totalEntity = 0;
        for (const e of alive) {
          const tk = e.components.tank;
          if (tk) totalEntity += Object.values(tk.tanks).reduce((a, b) => a + b, 0);
        }
        const totalQi = totalAmbient + totalEntity;
        ambientEntitySum += totalQi > 0 ? totalAmbient / totalQi : 0.5;

        const totalAmb = ambientQl + ambientQs;
        shaLingSum += totalAmb > 0 ? ambientQs / totalAmb : 0.5;
      }
    }
  }

  const actualTicks = Math.max(ticksSeen, 1);
  const playerSurvival = playerAliveTicks / actualTicks;
  const speciesDiversity = diversitySum / actualTicks;
  const ecosystemHealth = Math.min(ecosystemSum / actualTicks, 1);

  const expectedBt = Math.max(1, Math.floor(actualTicks / 20));
  const breakthroughRate = Math.min(breakthroughs / expectedBt, 1);

  const ambientEntityRatio = ambientEntitySum / actualTicks;
  const ambientEntityScore = 1 - Math.abs(ambientEntityRatio - 0.5) * 2;

  const shaLingRatio = shaLingSum / actualTicks;
  const shaLingScore = 1 - Math.min(Math.abs(shaLingRatio - 0.4) * 3, 1);

  const total =
    0.25 * playerSurvival +
    0.2 * speciesDiversity +
    0.2 * breakthroughRate +
    0.15 * ecosystemHealth +
    0.1 * ambientEntityScore +
    0.1 * shaLingScore;

  return {
    total,
    playerSurvival,
    speciesDiversity,
    breakthroughRate,
    ecosystemHealth,
    ambientEntityRatio,
    shaLingRatio,
  };
}
