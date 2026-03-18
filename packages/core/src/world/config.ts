// ============================================================
// World config — simulation parameters
// ============================================================

export const WORLD_CONFIG = {
  initialBeastCount: 5,
  initialPlantCount: 3,
} as const;

export const ABSORB_CONFIG = {
  meditate: { base: 20, perRealm: 5 },
  moonlight: { base: 35, perRealm: 8 },
  photosynth: { base: 8, perRealm: 2 },
} as const;

export const DEVOUR_CONFIG = {
  powerScaling: 0.15,
  crossSpeciesAbsorb: 0.8,
  crossSpeciesReturn: 0.2,
  sameSpeciesAbsorb: 0.2,
  sameSpeciesReturn: 0.8,
} as const;
// 突破常量
export const BREAKTHROUGH_CONFIG = {
  qiCost: (realm: number) => realm * 50,
  baseSuccessRate: 0.1, // 基础 10%
  maxSuccessRate: 0.8, // 最高 80%
  failQiLossRatio: 0.5, // 突破失败扣除当前灵气的 50%
};
