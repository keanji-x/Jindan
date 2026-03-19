// ============================================================
// Species templates — derives from ReactorTemplate for compat
//
// v3: Simplified. Power/tank formulas now in ReactorTemplate.
// This module bridges old ActionRegistry species checks.
// ============================================================

import { UNIVERSE } from "../engine/index.js";
import type { SpeciesTemplate } from "./types.js";

/** Build species templates from universe reactor config */
function buildSpecies(): Record<string, SpeciesTemplate> {
  const result: Record<string, SpeciesTemplate> = {};
  for (const [key, reactor] of Object.entries(UNIVERSE.reactors)) {
    result[key] = {
      type: reactor.id as SpeciesTemplate["type"],
      name: reactor.name,
      actions: reactor.actions,
    };
  }
  return result;
}

export const SPECIES: Record<string, SpeciesTemplate> = buildSpecies();
