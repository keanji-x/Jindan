// ============================================================
// World config — re-exports from engine universe config
//
// v3: Legacy compat shim. Real config in engine/.
// ============================================================

import { UNIVERSE } from "../engine/index.js";

export const WORLD_CONFIG = {
  initialBeastCount: UNIVERSE.initialBeasts,
  initialPlantCount: UNIVERSE.initialPlants,
} as const;

export const ABSORB_CONFIG = UNIVERSE.absorb;

export const DEVOUR_CONFIG = {
  powerScaling: UNIVERSE.devourPowerScaling,
} as const;

export const BREAKTHROUGH_CONFIG = UNIVERSE.breakthrough;
