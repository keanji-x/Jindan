#!/usr/bin/env node
// ============================================================
// Jindan CLI — AI-friendly command interface
//
// 设计原则:
//   1. 每个指令都支持 --json 输出结构化数据
//   2. 每次动作后都显示「可用动作」列表, 引导 AI 下一步决策
//   3. 错误信息清晰, 包含修复建议
//   4. 支持 positional args (简洁) 和 flags (明确) 两种形式
// ============================================================

import { parseArgs } from "node:util";
import { ApiClient } from "./ApiClient.js";
import {
  formatActionResult,
  formatBeasts,
  formatCultivator,
  formatLeaderboard,
  formatWorld,
} from "./format.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "http://localhost:3001" },
    id: { type: "string", short: "i" },
    name: { type: "string", short: "n" },
    target: { type: "string", short: "t" },
    json: { type: "boolean", default: false },
  },
});

const api = new ApiClient(values.host!);
const command = positionals[0];
const jsonMode = values.json!;

type Formattable = Record<string, unknown> | Record<string, unknown>[];

/** json 模式下输出原始 JSON, 否则用格式化函数 */
function output(data: unknown, formatter?: (d: Formattable) => string) {
  if (jsonMode || !formatter) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatter(data as Formattable));
  }
}

async function main() {
  try {
    switch (command) {
      // ── 信息查询 ──────────────────────────────────────
      case "world":
      case "status": {
        const world = await api.getWorldStatus();
        output(world, formatWorld);
        break;
      }

      case "info": {
        const id = values.id ?? positionals[1];
        if (!id) throw usageError("info --id <id>", "查看修仙者详细信息");
        const c = await api.getCultivator(id);
        output(c, formatCultivator);
        break;
      }

      case "beasts": {
        const beasts = await api.getBeasts();
        output(beasts, formatBeasts);
        break;
      }

      case "leaderboard":
      case "rank": {
        const lb = await api.getLeaderboard();
        output(lb, formatLeaderboard);
        break;
      }

      // ── 创建角色 ──────────────────────────────────────
      case "create": {
        const name = values.name ?? positionals[1];
        if (!name) throw usageError("create --name <名字>", "创建一位新的修仙者");
        const c = await api.createCultivator(name);
        output(c, formatCultivator);
        console.log(`\n💡 记住你的 ID: ${(c as Record<string, unknown>).id}`);
        console.log(`💡 下一步: jindan cultivate --id ${(c as Record<string, unknown>).id}`);
        break;
      }

      // ── 核心动作 ──────────────────────────────────────
      case "cultivate": {
        const id = values.id ?? positionals[1];
        if (!id) throw usageError("cultivate --id <id>", "修炼: 吸收灵气, 增长修为");
        const r = await api.cultivate(id);
        output(r, formatActionResult);
        break;
      }

      case "breakthrough": {
        const id = values.id ?? positionals[1];
        if (!id)
          throw usageError(
            "breakthrough --id <id>",
            "尝试境界突破 (需要经验 ≥ expToNext 且灵力 ≥ 50%)",
          );
        const r = await api.breakthrough(id);
        output(r, formatActionResult);
        break;
      }

      case "fight": {
        const id = values.id ?? positionals[1];
        if (!id)
          throw usageError("fight --id <id> [--target <beastId>]", "狩猎妖兽 (不指定目标则随机)");
        const r = await api.fightBeast(id, values.target);
        output(r, formatActionResult);
        break;
      }

      case "pvp": {
        const attackerId = values.id ?? positionals[1];
        const defenderId = values.target ?? positionals[2];
        if (!attackerId || !defenderId) {
          throw usageError("pvp --id <你的id> --target <对手id>", "发起修士对决 (败者死亡!)");
        }
        const r = await api.fightPvP(attackerId, defenderId);
        output(r, formatActionResult);
        break;
      }

      case "pickup": {
        const id = values.id ?? positionals[1];
        if (!id) throw usageError("pickup --id <id>", "拾取区域中散落的无主灵石");
        const r = await api.pickupStones(id);
        output(r, formatActionResult);
        break;
      }
      default:
        printHelp();
        break;
    }
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(err.message);
    } else {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }
}

// ── Help ──────────────────────────────────────────────────

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🏔️  金丹 · 修仙世界 CLI  🏔️                ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  📖 信息查询                                              ║
║    world / status           查看世界状态                  ║
║    info -i <id>             查看修仙者信息                ║
║    beasts                   查看妖兽列表                  ║
║    leaderboard / rank       排行榜                        ║
║                                                           ║
║  🧘 修炼动作                                              ║
║    create -n <名字>         创建修仙者                    ║
║    cultivate -i <id>        修炼 (吸灵气→涨经验)         ║
║    breakthrough -i <id>     突破 (需经验+灵力充足)        ║
║                                                           ║
║  ⚔️  战斗动作                                              ║
║    fight -i <id> [-t bid]   狩猎妖兽 (不指定则随机)      ║
║    pvp -i <id> -t <id>      修士对决 (败者死亡!)          ║
║                                                           ║
║  💎 资源动作                                              ║
║    pickup -i <id>           拾取无主灵石                  ║
║                                                           ║
║  🔧 全局选项                                              ║
║    --host <url>             API 地址 (默认 :3001)         ║
║    --json                   输出原始 JSON                 ║
║                                                           ║
║  💡 新手指引:                                              ║
║    1. jindan create -n "你的名字"  → 记住返回的 id       ║
║    2. jindan cultivate -i <id>     → 反复修炼            ║
║    3. jindan info -i <id>          → 看看经验够了没      ║
║    4. jindan breakthrough -i <id>  → 尝试突破!           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// ── Error Helpers ─────────────────────────────────────────

class UsageError extends Error {}

function usageError(usage: string, description: string): UsageError {
  return new UsageError(
    `❌ 参数不足\n` +
      `   用法: jindan ${usage}\n` +
      `   说明: ${description}\n` +
      `   提示: 加 --json 可获得结构化输出`,
  );
}

main();
