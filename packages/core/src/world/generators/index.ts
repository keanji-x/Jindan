import type { SpeciesGenerator } from "../config/types.js";
import { ArtifactGenerator } from "./artifact.js";
import { BeastGenerator } from "./beast.js";
import { HumanGenerator } from "./human.js";
import { PlantGenerator } from "./plant.js";
import { SectGenerator } from "./sect.js";

export const ALL_GENERATORS: Record<string, SpeciesGenerator> = {
  [HumanGenerator.id]: HumanGenerator,
  [BeastGenerator.id]: BeastGenerator,
  [PlantGenerator.id]: PlantGenerator,
  [ArtifactGenerator.id]: ArtifactGenerator,
  [SectGenerator.id]: SectGenerator,
};
