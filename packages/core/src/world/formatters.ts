// ============================================================
// Formatters — 集中管理表现层文本 (Flavor Text)
// 将所有的修真文案、Emoji 等与核心物理系统剥离
// ============================================================

import { UNIVERSE } from "./config/universe.config.js";
import type { Entity } from "./types.js";

export const Formatters = {
  breakthrough: (entity: Entity, upgradeCost: number, newRealm: number) => {
    return `✨「${entity.name}」燃烧了 ${upgradeCost} 点本源为代价，强行将生命跃迁至高维，境界突破至 ${newRealm} 阶！`;
  },

  devourSuccess: (attacker: Entity, target: Entity, logs: string[]) => {
    return `「${attacker.name}」强行吞入「${target.name}」的本源！\n结算日志：\n${logs.map((l) => `  - ${l}`).join("\n")}`;
  },

  devourTargetDeath: (attacker: Entity) => {
    return `被「${attacker.name}」当场抽干了本源，神魂俱灭`;
  },

  devourBacklash: (target: Entity, logs: string[]) => {
    return `强行吞噬「${target.name}」导致反噬爆体：${logs[logs.length - 1]}`;
  },

  absorbSuccess: (entity: Entity, extracted: number, gained: number, overflow: number) => {
    return `「${entity.name}」汲取天地精华 ${extracted} 点，经炉心凝练入账本源 ${gained} 点。${overflow > 0 ? `因气海盈满，走火散功 ${overflow} 点。` : ""}`;
  },

  absorbBacklash: (logs: string[]) => {
    return `冥想吐纳失控导致走火入魔生机断绝：${logs[logs.length - 1]}`;
  },

  entityCreated: (entity: Entity, coreCurrent: number) => {
    const reactor = UNIVERSE.reactors[entity.species];
    const displayName = reactor?.name ?? entity.species;
    return `${displayName}「${entity.name}」现世！灵气 ${coreCurrent}`;
  },

  entityTomb: (entity: Entity) => {
    return `🪦「${entity.name}」盖棺定论，魂归安息`;
  },

  entityReincarnated: (oldName: string, newName: string, articleLength: number) => {
    return `🔄「${oldName}」转生为「${newName}」，携带前世记忆（${articleLength}字）`;
  },

  tickComplete: (tick: number) => {
    return `--- 第 ${tick} 天结束 ---`;
  },
};
