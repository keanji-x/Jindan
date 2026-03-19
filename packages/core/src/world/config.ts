// ============================================================
// World config — re-exports from engine universe config
// ============================================================

import { UNIVERSE } from "../engine/index.js";

export const ABSORB_CONFIG = UNIVERSE.absorb;

export const DEVOUR_CONFIG = {
  powerScaling: UNIVERSE.devourPowerScaling,
} as const;

export const BREAKTHROUGH_CONFIG = UNIVERSE.breakthrough;
