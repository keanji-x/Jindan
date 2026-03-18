// ============================================================
// Entity types — what a living being IS
// ============================================================

// Re-export action types from actions/
export type { ActionDef, ActionId } from "./actions/types.js";

/** 物种类型 */
export type SpeciesType = "human" | "beast" | "plant";

/** 组件：灵气 */
export interface QiComponent {
  current: number;
  max: number;
}

/** 组件：战斗 */
export interface CombatComponent {
  power: number;
}

/** 组件：修为 */
export interface CultivationComponent {
  realm: number;
}

/** 组件：物品 */
export interface InventoryComponent {
  spiritStones: number;
}

/** 世界中的一个生灵 */
export interface Entity {
  id: string;
  name: string;
  species: SpeciesType;
  alive: boolean;
  components: {
    qi?: QiComponent;
    combat?: CombatComponent;
    cultivation?: CultivationComponent;
    inventory?: InventoryComponent;
  };
}

/** 物种模板: 定义一个物种的天赋 */
export interface SpeciesTemplate {
  type: SpeciesType;
  name: string;
  baseQiDrain: number;
  baseMaxQi: (realm: number) => number;
  basePower: (realm: number) => number;
  actions: string[]; // ActionId references
}
