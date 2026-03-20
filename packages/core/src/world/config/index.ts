// ============================================================
// world/config/ barrel export
// ============================================================

export { BALANCE } from "./balance.config.js";
export type { SearchParams } from "./TunableParams.js";
export { applyParams, DEFAULT_PARAMS, PARAM_RANGES, perturb } from "./TunableParams.js";
export type * from "./types.js";
export { UNIVERSE } from "./universe.config.js";

// Convenience re-exports (previously in world/config.ts)
import { UNIVERSE } from "./universe.config.js";
export const ABSORB_CONFIG = UNIVERSE.absorb;
export const BREAKTHROUGH_CONFIG = UNIVERSE.breakthrough;
