// ============================================================
// WorldEvaluator — Fitness function for world balance assessment
//
// Scores a headless simulation on 6 dimensions:
//   1. Player Survival (can a player stay alive?)
//   2. Species Diversity (are all species present?)
//   3. Breakthrough Achievability (can a player level up?)
//   4. Ecosystem Health (are entities alive, not mass extinct?)
//   5. Ambient/Entity Ratio (is qi distributed between world and bodies?)
//   6. Sha/Ling Ratio (is pollution balanced?)
// ============================================================

import { vi } from "vitest";
import { AiRegistry } from "../entity/ai/AiRegistry.js";
import { World } from "../world/World.js";

export interface WorldScore {
  total: number;
  playerSurvival: number;
  speciesDiversity: number;
  breakthroughRate: number;
  ecosystemHealth: number;
  /** Avg ratio of ambient qi to total entity qi (0=all in bodies, 1=all ambient) */
  ambientEntityRatio: number;
  /** Avg ratio of sha(qs) to ling(ql) in ambient pool */
  shaLingRatio: number;
}

export interface EvalOptions {
  ticks: number;
  /** Max iterations of NPC loop per tick target (safety) */
  maxIterations?: number;
}

/**
 * Run a headless simulation and score the world.
 * Creates a world, adds a player, runs N ticks, observes.
 */
export function evaluateWorld(opts: EvalOptions): WorldScore {
  const world = new World();
  const player = world.createEntity("评测者", "human");
  const playerId = player.id;

  const totalTicks = opts.ticks;
  const maxIter = opts.maxIterations ?? totalTicks * 20;

  // Track metrics per tick
  let playerAliveTicks = 0;
  let diversitySum = 0;
  let ecosystemSum = 0;
  let breakthroughs = 0;
  let ambientEntitySum = 0;
  let shaLingSum = 0;
  let ticksSeen = 0;

  const initialEntityCount = world.getAliveEntities().length;

  // Listen for breakthrough events
  world.events.onAny((e) => {
    if (e.type === "entity_breakthrough" && e.data.id === playerId) {
      breakthroughs++;
    }
  });

  // Simulate: NPC brain loop
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

    // Player acts: meditate when available, breakthrough when possible
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

    // Record metrics whenever tick advances
    if (world.tick > ticksSeen) {
      const newTicks = world.tick - ticksSeen;
      for (let t = 0; t < newTicks; t++) {
        ticksSeen++;

        const alive = world.getAliveEntities();
        const plants = alive.filter((e) => e.species === "plant").length;
        const beasts = alive.filter((e) => e.species === "beast").length;
        const playerAlive = alive.some((e) => e.id === playerId);

        if (playerAlive) playerAliveTicks++;

        // Diversity: ratio of minority to majority species
        const minSpecies = Math.min(plants, beasts);
        const maxSpecies = Math.max(plants, beasts);
        diversitySum += maxSpecies > 0 ? minSpecies / maxSpecies : 0;

        // Ecosystem: alive ratio
        ecosystemSum += alive.length / Math.max(initialEntityCount, 1);

        // Ambient/Entity ratio: how much qi is "free" vs "in bodies"
        const snap = world.getSnapshot();
        const ambientQl = snap.ambientPool.pools.ql ?? 0;
        const ambientQs = snap.ambientPool.pools.qs ?? 0;
        const totalAmbient = ambientQl + ambientQs;
        let totalEntity = 0;
        for (const e of alive) {
          const t = e.components.tank;
          if (t) totalEntity += Object.values(t.tanks).reduce((a, b) => a + b, 0);
        }
        const totalQi = totalAmbient + totalEntity;
        ambientEntitySum += totalQi > 0 ? totalAmbient / totalQi : 0.5;

        // Sha/Ling ratio in ambient
        const totalAmb = ambientQl + ambientQs;
        shaLingSum += totalAmb > 0 ? ambientQs / totalAmb : 0.5;
      }
    }
  }

  vi.useRealTimers();

  // Score
  const actualTicks = Math.max(ticksSeen, 1);
  const playerSurvival = playerAliveTicks / actualTicks;
  const speciesDiversity = diversitySum / actualTicks;
  const ecosystemHealth = Math.min(ecosystemSum / actualTicks, 1);

  // Breakthrough: expect ~1-3 in N ticks, score 1.0 if ≥1
  const expectedBt = Math.max(1, Math.floor(actualTicks / 20));
  const breakthroughRate = Math.min(breakthroughs / expectedBt, 1);

  // Ambient/Entity: ideal is ~0.3-0.7 (balanced). Score peaks at 0.5.
  const ambientEntityRatio = ambientEntitySum / actualTicks;
  const ambientEntityScore = 1 - Math.abs(ambientEntityRatio - 0.5) * 2; // 0.5→1.0, 0/1→0.0

  // Sha/Ling: ideal is ~0.3-0.5 (some sha is natural). Score peaks at 0.4.
  const shaLingRatio = shaLingSum / actualTicks;
  const shaLingScore = 1 - Math.min(Math.abs(shaLingRatio - 0.4) * 3, 1); // 0.4→1.0

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
