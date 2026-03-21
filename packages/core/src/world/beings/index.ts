// ============================================================
// Beings Registry — 所有生灵（反应炉模板）的聚合注册表
//
// 新增物种只需：1. 新建 xxx.ts  2. 这里加一行 import
// ============================================================

import type { ReactorTemplate } from "../config/types.js";
import { BeastReactor } from "./beast.js";
import { HumanReactor } from "./human.js";
import { PlantReactor } from "./plant.js";

/** 所有已注册的生灵类型 */
export const ALL_BEINGS: Record<string, ReactorTemplate> = {
  [HumanReactor.id]: HumanReactor,
  [BeastReactor.id]: BeastReactor,
  [PlantReactor.id]: PlantReactor,
};
