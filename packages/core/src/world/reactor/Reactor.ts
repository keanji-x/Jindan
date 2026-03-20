import { ParticleTransfer } from "./ParticleTransfer.js";
import type { ParticleBucket, Polarity } from "./types.js";

/**
 * 反应炉核心引擎 (Reactor Engine)
 * 生物反应炉是一个全自动化状态机结构。外部只能向内打入粒子（Action Beam）。
 * 系统会在每个 Tick 依据设定的定律（自我燃烧与免疫排异）进行物质推演。
 */
export const Reactor = {
  /**
   * 结算反应炉的一个 Tick 的自动化物理过程。
   *
   * 法则 1. 【基础代谢】默认等比例 burn 掉自身极性的粒子，向外等量排泄相反极性的粒子废料
   * 法则 2. 【排异反应】强制 burn 掉不平衡的杂质粒子，并且同样输出废料。消耗本体生命。
   * 法则 3. 【停机寂灭】如果发现主要粒子耗尽（无法 burn），反应炉停机寂灭。
   *
   * @param internalPool 反应炉本体的内置储罐
   * @param externalPool 外界大环境的能量海
   * @param ownPolarity 本体的本我配释，例如纯灵气修真者 { ql: 1.0 }
   * @param oppositePolarity 排泄废物的配释，例如修真者排出的就是 { qs: 1.0 }
   * @param baseBurnRate 本周期的基础代谢规模
   */
  tick(
    internalPool: ParticleBucket,
    externalPool: ParticleBucket,
    ownPolarity: Polarity,
    oppositePolarity: Polarity,
    baseBurnRate: number,
  ): { alive: boolean; logs: string[] } {
    const logs: string[] = [];

    // 获取反应炉的主燃料粒子（在本我极性中占比例大于0的粒子）
    const coreParticles = Object.keys(ownPolarity).filter(
      (p) => ownPolarity[p] !== undefined && ownPolarity[p]! > 0,
    );
    // 寻找杂质（体内不属于主要燃料的粒子集合）
    const impurities = Object.keys(internalPool).filter(
      (p) => !coreParticles.includes(p) && (internalPool[p] ?? 0) > 0,
    );

    // [法则 2] 排异反应 (Immune Engine)
    // 发现任何一丁点不属于 ownPolarity 的粒子，就必须用本身的生命燃料去同归于尽（转化为相反极性）
    for (const poison of impurities) {
      const poisonAmount = internalPool[poison] ?? 0;
      if (poisonAmount <= 0) continue;

      // 寻找可用的主燃料去中和它
      const fuelType = coreParticles[0];
      if (!fuelType) break;

      const fuelAvail = internalPool[fuelType] ?? 0;
      const amountToBurn = Math.min(poisonAmount, fuelAvail);

      if (amountToBurn > 0) {
        // 极性反转在这里（反应炉逻辑内）发生：
        // 1. 本源体内消耗 1份生命燃料 和 1份毒素 (Reactants)
        const reactants: ParticleBucket = { [poison]: amountToBurn, [fuelType]: amountToBurn };

        // 2. 将销毁的总量（1+1=2）反转极性，生成为排放到外界的产物 (Products)
        const products = ParticleTransfer.createBucket(oppositePolarity, amountToBurn * 2);

        // 3. 严格交由账本原子转换，不凭空捏造和销毁物质
        ParticleTransfer.transferWithConversion(internalPool, externalPool, reactants, products);

        logs.push(
          `【免疫排斥】耗费 ${amountToBurn} 个 ${fuelType} 融毁外来的 ${amountToBurn} 杂质，排向外界`,
        );
      }
    }

    // [法则 1] 基础代谢 (Baseline Metabolism)
    // 无论干啥，活着本身就要流失生命燃料到外界，并反转极性
    const fuelType = coreParticles[0];
    if (fuelType && (internalPool[fuelType] ?? 0) > 0) {
      const actualBurned = Math.min(baseBurnRate, internalPool[fuelType]!);

      const reactants = { [fuelType]: actualBurned };
      const products = ParticleTransfer.createBucket(oppositePolarity, actualBurned);

      ParticleTransfer.transferWithConversion(internalPool, externalPool, reactants, products);
      logs.push(`【生命代谢】基础代谢消耗 ${actualBurned} 核心寿命`);
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
   * @param ownPolarity 被击中者的本我配释
   * @param oppositePolarity 废弃物的配释（被中和散溢的能量）
   */
  processIncomingBeam(
    targetPool: ParticleBucket,
    externalPool: ParticleBucket,
    incomingBucket: ParticleBucket,
    sourceMultiplier: number,
    ownMultiplier: number,
    ownPolarity: Polarity,
    oppositePolarity: Polarity,
  ): { alive: boolean; logs: string[] } {
    const logs: string[] = [];
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

      if (coreParticles.includes(pid)) {
        // ==========================================
        // 【法则 A: 强行灌顶 / 洗劫吸收本源】 (极性相符，试图将 incoming 转化为自身的 fuel)
        // ==========================================
        if (densityRatio <= 1) {
          // 【吸收低阶能量】例如 100点1级灵气，进入10级大佬体内。
          // 实际只能压榨出 10点10级灵气，剩下的 90点质量无法压缩，作为低阶废气被排泄入世界。物质绝对守恒！
          const gainedYield = Math.floor(incomingRawAmount * densityRatio);
          const waste = incomingRawAmount - gainedYield;

          // 核心转移结算
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
          // 【强行灌顶 / 被吸收高阶能量】10点10级灵气，打入1级萌新以内。
          // 高维质量会引发空间膨胀，10点十级灵气需要膨胀为 100点一级灵气！
          // 缺少的 90点物质质量，必须强行从大道(external)中虹吸来补足空洞，否则萌新无法容纳。
          const totalExpansion = Math.floor(incomingRawAmount * densityRatio);
          const deficit = totalExpansion - incomingRawAmount;

          const externalAvailable = externalPool[pid] ?? 0;
          const actualHoned = Math.min(deficit, externalAvailable);
          const actualTotalGain = incomingRawAmount + actualHoned;

          // 本源结转入体
          ParticleTransfer.transfer(incomingBucket, targetPool, { [pid]: incomingRawAmount });
          // 引爆环境虹吸漩涡！
          if (actualHoned > 0) {
            ParticleTransfer.transfer(externalPool, targetPool, { [pid]: actualHoned });
          }

          logs.push(
            `【强行灌顶】承受 ${incomingRawAmount} 高维同源物，引发灵气风暴虹吸了外界 ${actualHoned} 物质填补，暴长 ${actualTotalGain} 本源！`,
          );
        }
      } else {
        // ==========================================
        // 【法则 B: 攻击打击 / 投毒】 (极性不符，触发排异融毁)
        // ==========================================
        // 防守方需要的本源燃料 = 攻击方的绝对质量数量 * 密度差
        const requiredFuel = Math.ceil(incomingRawAmount * densityRatio);
        const fuelAvail = targetPool[fuelType] ?? 0;

        // 反应炉拼尽全力能拿来阻挡的量
        const achievableFuel = Math.min(requiredFuel, fuelAvail);

        // 反推多少入侵者被成功中和了？
        const neutralizedBox = requiredFuel > 0 ? achievableFuel / densityRatio : incomingRawAmount;
        const actualNeutralized = Math.min(incomingRawAmount, Math.ceil(neutralizedBox));

        if (achievableFuel > 0 || actualNeutralized > 0) {
          // 中和的过程：己方消耗了 achievableFuel，同时抵消了敌方的 actualNeutralized
          const selfDecayReactants = { [fuelType]: achievableFuel };

          // 敌方物质被中和进了外界废气
          ParticleTransfer.transferWithConversion(
            incomingBucket,
            externalPool,
            { [pid]: actualNeutralized },
            ParticleTransfer.createBucket(oppositePolarity, actualNeutralized),
          );
          // 己方物质同归于尽变成了废气
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

        // 如果有没有被抵消完的毒素，它留存在 incomingBucket 里。
        // 它冲破了防护网，像脱缰野马一样灌入反应炉内导致结构不可逆故障
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
