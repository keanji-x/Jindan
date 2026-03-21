import type { GameSystem } from "./GameSystem.js";
import { doAcquire } from "./handlers/acquire.js";
import { doChat } from "./handlers/chat.js";
import { doCourt } from "./handlers/court.js";
import { doDevour } from "./handlers/devour.js";
import { doEnslave } from "./handlers/enslave.js";
import { doMate } from "./handlers/mate.js";
import { doRecruit } from "./handlers/recruit.js";
import { doTravel } from "./handlers/travel.js";
import { doTreat } from "./handlers/treat.js";
import type { ActionDef, ActionResolver } from "./types.js";

const interactionResolver: ActionResolver = (entity, actionId, context) => {
  switch (actionId) {
    case "devour":
      return doDevour(entity, actionId, context);
    case "chat":
      return doChat(entity, actionId, context);
    case "court":
      return doCourt(entity, actionId, context);
    case "acquire":
      return doAcquire(entity, actionId, context);
    case "enslave":
      return doEnslave(entity, actionId, context);
    case "mate":
      return doMate(entity, actionId, context);
    case "recruit":
      return doRecruit(entity, actionId, context);
    case "treat":
      return doTreat(entity, actionId, context);
    case "travel":
      return doTravel(entity, actionId, context);
    default:
      return { status: "aborted", reason: `Unknown action: ${actionId}` };
  }
};

// ── Shared base action constants ─────────────────────────────

export const DEVOUR: ActionDef = {
  id: "devour",
  name: "吞噬",
  description: "攻击其他生灵，胜者夺取败者灵气",
  qiCost: 10,
  needsTarget: true,
  npcTargetFilter: "npc-only",
  relationRange: [-100, 50],
  canExecute: (entity, ctx) => {
    const hasTargets = ctx.getAliveEntities().some((e) => e.id !== entity.id);
    return hasTargets ? { ok: true } : { ok: false, reason: "没有可吞噬的目标" };
  },
};

export const CHAT: ActionDef = {
  id: "chat",
  name: "传音",
  description: "向其他生灵发送神念",
  qiCost: 0,
  needsTarget: true,
  relationRange: [-80, 100],
};

export const COURT: ActionDef = {
  id: "court",
  name: "求爱",
  description: "向目标表达爱意，提升双方好感",
  qiCost: 5,
  needsTarget: true,
  relationRange: [30, 100],
};

export const ACQUIRE: ActionDef = {
  id: "acquire",
  name: "获取",
  description: "获取目标的所有权（法宝、灵植等）",
  qiCost: 5,
  needsTarget: true,
  relationRange: [-100, 100],
};

export const ENSLAVE: ActionDef = {
  id: "enslave",
  name: "奴役",
  description: "以力服人，奴役弱小生灵（需境界高出2级）",
  qiCost: 20,
  needsTarget: true,
  npcTargetFilter: "npc-only",
  relationRange: [-100, 30],
  canExecute: (entity, _ctx) => {
    const cult = entity.components.cultivation;
    if (!cult) return { ok: false, reason: "无修为组件" };
    if (cult.realm < 2) return { ok: false, reason: "境界太低，无法奴役" };
    return { ok: true };
  },
};

export const MATE: ActionDef = {
  id: "mate",
  name: "合欢",
  description: "与伴侣结合繁衍后代（双方需高好感度）",
  qiCost: 15,
  needsTarget: true,
  relationRange: [70, 100],
};

export const RECRUIT: ActionDef = {
  id: "recruit",
  name: "招揽",
  description: "将目标收入门下，建立师徒或宗门关系",
  qiCost: 10,
  needsTarget: true,
  relationRange: [20, 100],
};

export const TREAT: ActionDef = {
  id: "treat",
  name: "请客",
  description: "以灵气设宴款待目标，赠送灵气并大幅提升好感",
  qiCost: 8,
  needsTarget: true,
  relationRange: [-50, 100],
};

export const TRAVEL: ActionDef = {
  id: "travel",
  name: "共游",
  description: "与同伴结伴游历山水间，提升好感",
  qiCost: 3,
  needsTarget: true,
  relationRange: [10, 100],
};

export const InteractionSystem: GameSystem = {
  id: "interaction",
  name: "双边交互系统",
  actions: [DEVOUR, CHAT, COURT, ACQUIRE, ENSLAVE, MATE, RECRUIT, TREAT, TRAVEL],
  handler: interactionResolver,
};
