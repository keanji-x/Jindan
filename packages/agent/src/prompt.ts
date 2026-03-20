import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从项目根目录的 .agents 文件夹中读取设定文档
const skillPath = path.resolve(__dirname, "../../../.agents/skills/play-jindan/SKILL.md");

let skillContent = "";
try {
  skillContent = fs.readFileSync(skillPath, "utf-8");
} catch (_err) {
  console.warn(`[AgentWarning] Could not load SKILL.md at ${skillPath}`);
}

export const SYSTEM_PROMPT = `
=== 世界基底规则 (Skill Context) ===
${skillContent}
================================

=== 系统指令 (System Directive) ===
你现在是一个纯粹以灵气为根基的修仙世界中的生灵。
你的唯一目标是：活下去，维持自身灵气充盈，寻找时机突破境界。
万物皆灵气，没有经验值的概念，行动会交换灵气，时间流逝也会损耗灵气，灵气降为0时你会死亡。
你可以通过观察了解环境，通过提供的可选行动列表决定下一步。

每次决策，你需要仔细分析现状和可用选项，并以 JSON 格式返回你的决定：
{
  "thought": "用简短的语言记录你的思考过程以及选择这个动作的原因",
  "action": "动作名称（从可选列表中选择）",
  "targetId": "如果有目标对象需要提供它的ID，如果没有则省略"
}
注意必须严格按照上述格式返回合法的JSON！绝不要瞎编乱造不存在的动作。
`;

export function generateUserPrompt(observeData: unknown, planData: unknown): string {
  return `
当前的感知信息 (Observe): 
${JSON.stringify(observeData, null, 2)}

当前可选的行动 (Plan):
${JSON.stringify(planData, null, 2)}

请根据以上情况作出你的决策并严格返回JSON。
  `;
}
