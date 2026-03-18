// ============================================================
// Entity Factory — creating new entities with qi conservation
//
// Note: AmbientQi param is passed in, not imported from world/,
//       to avoid circular dependency (entity ↔ world).
// ============================================================

import { nanoid } from "nanoid";
import { SPECIES } from "./index.js";
import type { Entity, SpeciesType } from "./types.js";

/** Minimal interface for ambient qi (avoids importing from world/) */
export interface AmbientQiRef {
  current: number;
}

const BEAST_NAMES = [
  "赤焰虎",
  "碧水蛟",
  "风翼鹰",
  "玄铁熊",
  "紫电狼",
  "幽冥蛇",
  "金鬃狮",
  "霜角鹿",
  "烈焰蝠",
  "寒霜蜘蛛",
  "青鳞蟒",
  "银月狐",
  "雷云豹",
  "铁甲龟",
  "血影鹤",
];

const PLANT_NAMES = [
  "碧灵草",
  "七星莲",
  "紫薇藤",
  "玄冰花",
  "赤炎果",
  "月华兰",
  "龙血木",
  "星辰菌",
  "凝露苔",
  "灵脉根",
];

/** expToNext formula (duplicated here to avoid circular dep with world/config) */
function expToNext(realm: number): number {
  return 100 * realm * realm;
}

/** Create a player entity, deducting initial qi from ambient */
export function createEntity(name: string, species: SpeciesType, ambientQi: AmbientQiRef): Entity {
  const template = SPECIES[species]!;
  const realm = 1;
  const maxQi = template.baseMaxQi(realm);
  const initialQi = Math.min(maxQi, ambientQi.current);
  ambientQi.current -= initialQi;

  const hasCombat = species === "human" || species === "beast";
  const hasInventory = species === "human";

  return {
    id: `${species[0]}_${nanoid(8)}`,
    name,
    species,
    alive: true,
    components: {
      qi: { current: initialQi, max: maxQi },
      cultivation: { realm },
      ...(hasCombat && {
        combat: { power: template.basePower(realm) + Math.floor(Math.random() * 3) },
      }),
      ...(hasInventory && { inventory: { spiritStones: 0 } }),
    },
  };
}

/** Spawn a batch of NPC beasts */
export function spawnBeasts(count: number, totalQi: number, ambientQi: AmbientQiRef): Entity[] {
  const qiPer = Math.floor(totalQi / count);
  const entities: Entity[] = [];

  for (let i = 0; i < count; i++) {
    const rank = 1 + Math.floor(Math.random() * 3);
    const tmpl = SPECIES.beast!;
    const maxQi = tmpl.baseMaxQi(rank);
    const qi = Math.min(qiPer, maxQi);
    ambientQi.current -= qi;

    const name = BEAST_NAMES[Math.floor(Math.random() * BEAST_NAMES.length)]!;
    entities.push({
      id: `b_${nanoid(8)}`,
      name: `${rank}阶${name}`,
      species: "beast",
      alive: true,
      components: {
        qi: { current: qi, max: maxQi },
        combat: { power: tmpl.basePower(rank) + Math.floor(Math.random() * rank * 2) },
        cultivation: { realm: rank },
      },
    });
  }
  return entities;
}

/** Spawn a batch of NPC plants */
export function spawnPlants(count: number, totalQi: number, ambientQi: AmbientQiRef): Entity[] {
  const qiPer = Math.floor(totalQi / count);
  const entities: Entity[] = [];

  for (let i = 0; i < count; i++) {
    const tmpl = SPECIES.plant!;
    const maxQi = tmpl.baseMaxQi(1);
    const qi = Math.min(qiPer, maxQi);
    ambientQi.current -= qi;

    const name = PLANT_NAMES[Math.floor(Math.random() * PLANT_NAMES.length)]!;
    entities.push({
      id: `p_${nanoid(8)}`,
      name,
      species: "plant",
      alive: true,
      components: {
        qi: { current: qi, max: maxQi },
        cultivation: { realm: 1 },
      },
    });
  }
  return entities;
}
