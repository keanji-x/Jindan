// ============================================================
// CombatSystem — 战斗判定 (PvE / PvP)
// ============================================================

import type { MVP_CONFIG } from "../config.js";
import type { EventBus } from "../EventBus.js";
import type { Beast, CombatResult, Cultivator, WorldResources } from "../types.js";
import type { ResourceSystem } from "./ResourceSystem.js";

export class CombatSystem {
  constructor(
    private readonly config: typeof MVP_CONFIG,
    private readonly events: EventBus,
    private readonly resourceSystem: ResourceSystem,
  ) {}

  /**
   * 计算胜率 (sigmoid on power difference)
   * P(A wins) = 1 / (1 + exp(-k * (powerA - powerB)))
   */
  private winProbability(powerA: number, powerB: number): number {
    const k = this.config.combat.powerScaling;
    return 1 / (1 + Math.exp(-k * (powerA - powerB)));
  }

  /** 修士 vs 妖兽 */
  fightBeast(
    cultivator: Cultivator,
    beast: Beast,
    resources: WorldResources,
    tick: number,
  ): CombatResult {
    const winProb = this.winProbability(cultivator.power, beast.power);
    const cultivatorWins = Math.random() < winProb;

    let result: CombatResult;

    if (cultivatorWins) {
      const spoils = this.resourceSystem.recycleBeast(
        beast,
        resources,
        tick,
        `被修士「${cultivator.name}」斩杀`,
      );
      cultivator.spiritStones += spoils;
      result = {
        winner: { id: cultivator.id, name: cultivator.name, type: "cultivator" },
        loser: { id: beast.id, name: beast.name, type: "beast" },
        spoils,
      };
    } else {
      this.resourceSystem.recycleCultivator(
        cultivator,
        resources,
        tick,
        `被妖兽「${beast.name}」击杀`,
      );
      result = {
        winner: { id: beast.id, name: beast.name, type: "beast" },
        loser: { id: cultivator.id, name: cultivator.name, type: "cultivator" },
        spoils: 0,
      };
    }

    this.events.emit({
      tick,
      type: "combat_result",
      data: { result, winProb },
      message: `⚔️「${result.winner.name}」击败「${result.loser.name}」（胜率 ${(winProb * 100).toFixed(1)}%）`,
    });

    return result;
  }

  /** 修士 vs 修士 (PvP) */
  fightPvP(
    attacker: Cultivator,
    defender: Cultivator,
    resources: WorldResources,
    tick: number,
  ): CombatResult {
    const winProb = this.winProbability(attacker.power, defender.power);
    const attackerWins = Math.random() < winProb;

    const winner = attackerWins ? attacker : defender;
    const loser = attackerWins ? defender : attacker;

    // 败者死亡, 灵石归胜者
    const spoils = loser.spiritStones;
    this.resourceSystem.recycleCultivator(loser, resources, tick, `被修士「${winner.name}」斩杀`);
    winner.spiritStones += spoils;

    const result: CombatResult = {
      winner: { id: winner.id, name: winner.name, type: "cultivator" },
      loser: { id: loser.id, name: loser.name, type: "cultivator" },
      spoils,
    };

    this.events.emit({
      tick,
      type: "combat_result",
      data: { result, winProb },
      message: `⚔️「${winner.name}」击败「${loser.name}」，夺取 ${spoils} 灵石（胜率 ${((attackerWins ? winProb : 1 - winProb) * 100).toFixed(1)}%）`,
    });

    return result;
  }
}
