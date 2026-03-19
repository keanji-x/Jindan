// ============================================================
// Qi Config — re-exports from engine universe config
//
// v3: Legacy compatibility shim. Real config in engine/.
// ============================================================

import { UNIVERSE } from "../../engine/index.js";

export const QI_CONFIG = {
  totalQi: UNIVERSE.totalParticles,
  initialAmbientRatio: UNIVERSE.initialAmbientRatio,
  drainFormula: UNIVERSE.drainFormula,
} as const;
