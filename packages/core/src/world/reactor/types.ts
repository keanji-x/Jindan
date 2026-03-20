import type { ParticleId } from "../config/types.js";

/**
 * 粒子束 (Particle Bucket)
 * 是底层物质转移的最小结构，代表一堆指定数量的粒子的集合组合。
 * 任何 Action (战斗、吸收、传功) 最终都会编译为一个 Bucket 打入实体的反应炉。
 */
export type ParticleBucket = Record<ParticleId, number>;

/**
 * 极性配释 (Polarity Signature)
 * 定义了反应炉理想的内部成分比例。例如 { ql: 1.0, qs: 0.0 }。
 * 偏离极性的粒子将被系统判定为“杂质”并强制 Burn 掉。
 */
export type Polarity = Record<ParticleId, number>;

/**
 * 账本原子级转账记录
 */
export interface TransferReceipt {
  /** 实际成功转移的粒子及其数量 */
  transferred: ParticleBucket;
  /** 一共转移了总物质多少量 */
  totalCount: number;
}
