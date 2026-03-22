// ============================================================
// snapshotTypes.ts — Agent 侧的 ContextSnapshot 类型定义
//
// 这些类型镜像了 Core 侧 ContextSnapshot.ts 的接口定义，
// 用于 Agent 消费 POST /entity/:id/snapshot 返回的数据。
// 保持独立避免 Agent 直接依赖 Core 包。
// ============================================================

export interface SelfBlock {
  id: string;
  name: string;
  species: string;
  speciesName: string;
  realm: number;
  qi: number;
  maxQi: number;
  qiPercent: number;
  mood: number;
  emotion: string;
  shortTermGoal: string;
  pastLivesArticle: string;
}

export interface NearbyEntity {
  id: string;
  name: string;
  species: string;
  speciesName: string;
  realm: number;
  qi: number;
  relation: number;
  relationTags: string[];
  threat: "harmless" | "equal" | "dangerous" | "deadly";
}

export interface PerceptionBlock {
  nearby: NearbyEntity[];
  worldTick: number;
  daoTanks: Record<string, number>;
  totalParticles: number;
}

export interface MemoryEvent {
  tick: number;
  type: string;
  summary: string;
  isMajor: boolean;
}

export interface MemoryBlock {
  majorEvents: MemoryEvent[];
  recentEvents: MemoryEvent[];
  lastThoughts: Array<{
    tick: number;
    innerVoice: string;
    actions: string[];
  }>;
}

export interface OptionsBlock {
  actions: Array<{
    action: string;
    targetId?: string;
    description: string;
    possible: boolean;
    reason?: string;
  }>;
}

export interface HintsBlock {
  isLowQi: boolean;
  isBreakthroughReady: boolean;
  hasHostileNearby: boolean;
  isWorldQiLow: boolean;
  recentlyAttacked: boolean;
}

export interface ContextSnapshot {
  self: SelfBlock;
  perception: PerceptionBlock;
  memory: MemoryBlock;
  options: OptionsBlock;
  hints: HintsBlock;
}
