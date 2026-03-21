import { ArtifactReactor } from "../beings/artifact.js";
import type { SpeciesGenerator } from "../config/types.js";

export const ArtifactGenerator: SpeciesGenerator = {
  id: "artifact",
  baseName: "法宝",
  canDerive: (ambient, _total) => {
    // 只有在灵气极其浓郁的地方才能自然孕育出法宝
    return (ambient.ql ?? 0) > 500;
  },
  derive: (ambient, _total) => {
    const ql = ambient.ql ?? 0;

    // 如果极度充沛，可能孕育先天灵宝（全服唯一）
    if (ql > 2000) {
      return {
        ...ArtifactReactor,
        id: "artifact_unique",
        name: "先天灵宝",
        maxInstances: 1,
        baseTanks: (realm) => ({ ql: 2000 * realm, qs: 0 }),
      };
    }

    return ArtifactReactor;
  },
};
