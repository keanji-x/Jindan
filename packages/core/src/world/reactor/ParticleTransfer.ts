import type { ParticleBucket, Polarity, TransferReceipt } from "./types.js";

/**
 * 粒子转移器 (ParticleTransfer)
 * 系统内唯一能够移动粒子的枢纽，遵循绝对的热力学物质守恒。
 * 粒子不能凭空创生与湮灭，只能在 Bucket 之间原子性转移。
 */
export const ParticleTransfer = {
  /**
   * 原子转移：从源槽抽取对应粒子倒入目标槽。
   * 如果源中燃料不足，只转移最大的库余量。
   */
  transfer(
    source: ParticleBucket,
    target: ParticleBucket,
    amounts: ParticleBucket,
  ): TransferReceipt {
    const actual: ParticleBucket = {};
    let totalCount = 0;

    for (const [pid, req] of Object.entries(amounts)) {
      if (req <= 0) continue;

      const available = source[pid] ?? 0;
      const toMove = Math.min(available, req);

      if (toMove > 0) {
        source[pid] = available - toMove;
        target[pid] = (target[pid] ?? 0) + toMove;
        actual[pid] = toMove;
        totalCount += toMove;
      }
    }

    return { transferred: actual, totalCount };
  },

  /**
   * 洗劫一空：将源 Bucket 中的所有粒子全数转入目标 Bucket。
   * (常用于无损吞噬、或者约束场崩塌时的爆发泄露)
   */
  transferAll(source: ParticleBucket, target: ParticleBucket): TransferReceipt {
    const amounts: ParticleBucket = { ...source };
    return ParticleTransfer.transfer(source, target, amounts);
  },

  /**
   * 转化转移 (Conversion Transfer)
   * 从源 Bucket 扣除 reactants (输入)，并向目标 Bucket 注入 products (输出)。
   * 这是反应炉"燃烧并反转极性"排向外界的核心，严格保证物质账本上的一环扣一环（输入=输出由调用方把控，或符合化学定律）。
   *
   * @param source 提供燃料的容器 (例如本体内部)
   * @param target 接收产物的容器 (例如外部环境)
   * @param reactants 确定要消耗的具体物质数量 (必须保证 source 有足够余额)
   * @param products 确定要转化为的具体物质数量
   */
  transferWithConversion(
    source: ParticleBucket,
    target: ParticleBucket,
    reactants: ParticleBucket,
    products: ParticleBucket,
  ): boolean {
    // 1. 安全检查：余额必须充足
    for (const [pid, req] of Object.entries(reactants)) {
      if (req > 0 && (source[pid] ?? 0) < req) return false;
    }

    // 2. 从源扣除
    for (const [pid, req] of Object.entries(reactants)) {
      if (req > 0) source[pid]! -= req;
    }

    // 3. 向目标增加新极性产物
    for (const [pid, gen] of Object.entries(products)) {
      if (gen > 0) target[pid] = (target[pid] ?? 0) + gen;
    }

    return true;
  },

  /**
   * 按极性比例凭空生成一束标准的 Bucket (例如生成对应极性的废料)
   */
  createBucket(polarity: Polarity, totalScale: number): ParticleBucket {
    const bucket: ParticleBucket = {};
    for (const [pid, ratio] of Object.entries(polarity)) {
      if (ratio > 0) {
        bucket[pid] = Math.ceil(ratio * totalScale);
      }
    }
    return bucket;
  },
};
