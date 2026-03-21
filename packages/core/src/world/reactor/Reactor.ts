import { ParticleTransfer } from "./ParticleTransfer.js";
import type { ParticleBucket, Polarity } from "./types.js";

/**
 * 反应炉核心引擎 (Reactor Engine)
 * 生物反应炉是一个全自动化状态机结构。外部只能向内打入粒子（Action Beam）。
 * 系统会在每个 Tick 依据设定的定律（比例代谢与排异）进行物质推演。
 *
 * 支持比例极性 — 物种可配 { ql: 0.7, qs: 0.3 } 等混合理想态。
 */
export const Reactor = {
  /**
   * 结算反应炉的一个 Tick 的自动化物理过程。
   *
   * 法则 1. 【比例排异】对比当前体内粒子实际占比 vs 理想占比(ownPolarity)，
   *         超标粒子按超出量 burn 掉，输出 oppositePolarity 废料
   * 法则 2. 【基础代谢】默认 burn 核心粒子，向外排泄 oppositePolarity 废料
   * 法则 3. 【停机寂灭】如果核心粒子耗尽，反应炉停机
   *
   * @param internalPool 反应炉本体的内置储罐
   * @param externalPool 外界大环境的能量海
   * @param ownPolarity 本体的理想粒子比例，如 { ql: 0.7, qs: 0.3 }
   * @param baseBurnRate 本周期的基础代谢规模
   */
  tick(
    internalPool: ParticleBucket,
    externalPool: ParticleBucket,
    ownPolarity: Polarity,
    baseBurnRate: number,
  ): { alive: boolean; logs: string[] } {
    const logs: string[] = [];
    const oppositePolarity = ParticleTransfer.invertPolarity(ownPolarity);

    // 获取反应炉中所有核心粒子（理想占比 > 0 的粒子）
    const coreParticles = Object.keys(ownPolarity).filter(
      (p) => ownPolarity[p] !== undefined && ownPolarity[p]! > 0,
    );

    // 计算体内总量
    const totalInternal = Object.values(internalPool).reduce((s, v) => s + (v ?? 0), 0);

    // [法则 1] 比例排异 (Proportional Immune Engine)
    // 对体内每种粒子，检查实际占比是否超标
    if (totalInternal > 0) {
      for (const [pid, amount] of Object.entries(internalPool)) {
        if ((amount ?? 0) <= 0) continue;

        const idealRatio = ownPolarity[pid] ?? 0;
        const actualRatio = amount! / totalInternal;
        const excess = actualRatio - idealRatio;

        if (excess > 0) {
          // 超标粒子量 = 超出比例 × 总量
          const excessAmount = Math.floor(excess * totalInternal);
          if (excessAmount <= 0) continue;

          if (idealRatio === 0) {
            // 纯异物：用核心燃料 1:1 同归于尽（与旧逻辑一致）
            const fuelType = coreParticles[0];
            if (!fuelType) break;
            const fuelAvail = internalPool[fuelType] ?? 0;
            const amountToBurn = Math.min(excessAmount, fuelAvail);

            if (amountToBurn > 0) {
              const reactants: ParticleBucket = { [pid]: amountToBurn, [fuelType]: amountToBurn };
              const products = ParticleTransfer.createBucket(oppositePolarity, amountToBurn * 2);
              ParticleTransfer.transferWithConversion(
                internalPool,
                externalPool,
                reactants,
                products,
              );
              logs.push(
                `【免疫排斥】耗费 ${amountToBurn} 个 ${fuelType} 融毁外来的 ${amountToBurn} 纯杂质 ${pid}，排向外界`,
              );
            }
          } else {
            // 比例超标：温和排出多余部分（不消耗核心燃料，只是缓释）
            const reactants: ParticleBucket = { [pid]: excessAmount };
            const products = ParticleTransfer.createBucket(oppositePolarity, excessAmount);
            ParticleTransfer.transferWithConversion(
              internalPool,
              externalPool,
              reactants,
              products,
            );
            logs.push(
              `【比例调和】${pid} 实际占比 ${(actualRatio * 100).toFixed(1)}% 超过理想 ${(idealRatio * 100).toFixed(1)}%，排出 ${excessAmount} 调节`,
            );
          }
        }
      }
    }

    // [法则 2] 基础代谢 (Baseline Metabolism)
    // 消耗核心粒子，按比例分配消耗
    let burnRemaining = baseBurnRate;
    for (const fuelType of coreParticles) {
      const ratio = ownPolarity[fuelType] ?? 0;
      if (ratio <= 0) continue;
      const burnForThis = Math.floor(baseBurnRate * ratio);
      const available = internalPool[fuelType] ?? 0;
      const actualBurned = Math.min(burnForThis, available);

      if (actualBurned > 0) {
        const reactants = { [fuelType]: actualBurned };
        const products = ParticleTransfer.createBucket(oppositePolarity, actualBurned);
        ParticleTransfer.transferWithConversion(internalPool, externalPool, reactants, products);
        burnRemaining -= actualBurned;
      }
    }
    if (baseBurnRate - burnRemaining > 0) {
      logs.push(`【生命代谢】基础代谢消耗 ${baseBurnRate - burnRemaining} 核心寿命`);
    }

    // [法则 3] 寂灭停机校验 (Collapse Check)
    let isAlive = false;
    for (const core of coreParticles) {
      if ((internalPool[core] ?? 0) > 0) {
        isAlive = true;
        break;
      }
    }

    if (!isAlive) {
      logs.push(`【约束崩溃】核心动力炉燃料殆尽，系统停机封停！`);
    }

    return { alive: isAlive, logs };
  },

  /**
   * 结算由于某个 Action 强制打入反应炉的一波粒子束 (Incoming Beam)
   * 完全遵循热力学第二定律和物质绝对守恒的降维打击！
   *
   * @param targetPool 被打击者（吸收者）自身的内置储罐
   * @param externalPool 外界大环境的能量海（负责填充虹吸差额或回收废料）
   * @param incomingBucket 游离的来袭粒子束（悬空账本）
   * @param sourceMultiplier 攻击发源地的能量密度倍率
   * @param ownMultiplier 被击中者的能量密度倍率
   * @param ownPolarity 被击中者的理想粒子比例
   */
  processIncomingBeam(
    targetPool: ParticleBucket,
    externalPool: ParticleBucket,
    incomingBucket: ParticleBucket,
    sourceMultiplier: number,
    ownMultiplier: number,
    ownPolarity: Polarity,
  ): { alive: boolean; logs: string[] } {
    const logs: string[] = [];
    const oppositePolarity = ParticleTransfer.invertPolarity(ownPolarity);
    const coreParticles = Object.keys(ownPolarity).filter(
      (p) => ownPolarity[p] !== undefined && ownPolarity[p]! > 0,
    );
    const fuelType = coreParticles[0];

    if (!fuelType) return { alive: false, logs: ["【致命异常】无主燃料配置"] };

    // 换算系数：源质量的密度 相对于 本我质量的密度
    // > 1: 源更加致密（降维打击 / 大补灌顶）
    // < 1: 源比较稀薄（蚍蜉撼树 / 牛嚼牡丹式吸收）
    const densityRatio = sourceMultiplier / ownMultiplier;

    for (const [pid, incomingRawAmount] of Object.entries(incomingBucket)) {
      if (incomingRawAmount <= 0) continue;

      // 根据 ownPolarity 中的权重判断亲和度
      const affinity = ownPolarity[pid] ?? 0;

      if (affinity > 0) {
        // ==========================================
        // 【法则 A: 亲和吸收】极性相符（按亲和度权重吸收）
        // ==========================================
        if (densityRatio <= 1) {
          // 【吸收低阶能量】
          const gainedYield = Math.floor(incomingRawAmount * densityRatio);
          const waste = incomingRawAmount - gainedYield;

          ParticleTransfer.transfer(incomingBucket, targetPool, { [pid]: gainedYield });
          if (waste > 0) {
            const wasteProducts = ParticleTransfer.createBucket(oppositePolarity, waste);
            ParticleTransfer.transferWithConversion(
              incomingBucket,
              externalPool,
              { [pid]: waste },
              wasteProducts,
            );
          }

          logs.push(
            `【同化】吸纳 ${incomingRawAmount} 稀薄同源物质，压缩提纯得 ${gainedYield} 本源，排出余下 ${waste} 废气`,
          );
        } else {
          // 【强行灌顶 / 被吸收高阶能量】
          const totalExpansion = Math.floor(incomingRawAmount * densityRatio);
          const deficit = totalExpansion - incomingRawAmount;

          const externalAvailable = externalPool[pid] ?? 0;
          const actualHoned = Math.min(deficit, externalAvailable);
          const actualTotalGain = incomingRawAmount + actualHoned;

          ParticleTransfer.transfer(incomingBucket, targetPool, { [pid]: incomingRawAmount });
          if (actualHoned > 0) {
            ParticleTransfer.transfer(externalPool, targetPool, { [pid]: actualHoned });
          }

          logs.push(
            `【强行灌顶】承受 ${incomingRawAmount} 高维同源物，引发灵气风暴虹吸了外界 ${actualHoned} 物质填补，暴长 ${actualTotalGain} 本源！`,
          );
        }
      } else {
        // ==========================================
        // 【法则 B: 攻击打击 / 投毒】（亲和度为 0，纯异物触发排异融毁）
        // ==========================================
        const requiredFuel = Math.ceil(incomingRawAmount * densityRatio);
        const fuelAvail = targetPool[fuelType] ?? 0;
        const achievableFuel = Math.min(requiredFuel, fuelAvail);
        const neutralizedBox = requiredFuel > 0 ? achievableFuel / densityRatio : incomingRawAmount;
        const actualNeutralized = Math.min(incomingRawAmount, Math.ceil(neutralizedBox));

        if (achievableFuel > 0 || actualNeutralized > 0) {
          const selfDecayReactants = { [fuelType]: achievableFuel };

          ParticleTransfer.transferWithConversion(
            incomingBucket,
            externalPool,
            { [pid]: actualNeutralized },
            ParticleTransfer.createBucket(oppositePolarity, actualNeutralized),
          );
          ParticleTransfer.transferWithConversion(
            targetPool,
            externalPool,
            selfDecayReactants,
            ParticleTransfer.createBucket(oppositePolarity, achievableFuel),
          );

          logs.push(
            `【遭受打击】入侵 ${incomingRawAmount} 异物。动力炉拼死燃烧了 ${achievableFuel} 本源，抵消了 ${actualNeutralized} 入侵物质...`,
          );
        }

        const remainingPoison = incomingBucket[pid] ?? 0;
        if (remainingPoison > 0) {
          ParticleTransfer.transfer(incomingBucket, targetPool, { [pid]: remainingPoison });
          logs.push(
            `【重创】防线彻底崩溃！剩余 ${remainingPoison} 高压毒素长驱直入，捣毁动力炉核心！`,
          );
        }
      }
    }

    // [法则 3] 寂灭停机校验
    let isAlive = false;
    for (const core of coreParticles) {
      if ((targetPool[core] ?? 0) > 0) {
        isAlive = true;
        break;
      }
    }

    if (!isAlive) {
      logs.push(`【绝命】核心动力炉机能丧失，系统宣布停机死寂`);
    }

    return { alive: isAlive, logs };
  },
};
