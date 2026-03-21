import { ArtifactReactor } from "../beings/artifact.js";
import type { SpeciesGenerator } from "../config/types.js";

export const ArtifactGenerator: SpeciesGenerator = {
  id: "artifact",
  baseName: "法宝",
  canDerive: (ambient, _total) => {
    return (ambient.ql ?? 0) > 500;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;

    if (ql > 2000) {
      return {
        ...ArtifactReactor,
        id: "artifact_unique",
        name: "先天灵宝",
        maxInstances: 1,
        proportionLimit: (realm: number) => 0.15 * realm,
        birthCost: 500,
      };
    }

    return ArtifactReactor;
  },
};
