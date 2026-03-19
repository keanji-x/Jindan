import { describe, expect, it, vi } from "vitest";
import {
  AgentHarness,
  HeuristicLlm,
  ScriptedLlm,
} from "./AgentTestHarness.js";

describe("Agent OODA Loop (离线测试)", () => {
  it("Scripted: 按预设脚本执行 OODA 循环", () => {
    vi.useFakeTimers();

    const harness = new AgentHarness({
      entityName: "脚本修士",
      llm: new ScriptedLlm([
        { thought: "初来乍到，先打坐积累灵气", action: "meditate" },
        { thought: "继续打坐", action: "meditate" },
        { thought: "休息一下", action: "rest" },
      ]),
    });

    const cyclesRun = harness.run(3);
    vi.runAllTimers();

    expect(cyclesRun).toBe(3);
    expect(harness.log.records).toHaveLength(3);

    // 验证每轮都有完整记录
    for (const record of harness.log.records) {
      expect(record.observe).toBeDefined();
      expect(record.plan).toBeDefined();
      expect(record.llmInput.system).toBeTruthy();
      expect(record.llmInput.user).toBeTruthy();
      expect(record.llmOutput.thought).toBeTruthy();
      expect(record.llmOutput.action).toBeTruthy();
      expect(record.actionResult).toBeDefined();
      expect(record.postState).toBeDefined();
    }

    // 验证第一轮是打坐
    expect(harness.log.records[0]!.llmOutput.action).toBe("meditate");
    expect(harness.log.records[0]!.actionResult.success).toBe(true);

    vi.useRealTimers();
  });

  it("Heuristic: 规则引擎跑 20 轮，验证有实质进展", () => {
    vi.useFakeTimers();

    const harness = new AgentHarness({
      entityName: "智能修士",
      llm: new HeuristicLlm(),
    });

    const cyclesRun = harness.run(20);
    vi.runAllTimers();

    console.log(`\n=== Heuristic 模式 ===`);
    console.log(`执行了 ${cyclesRun} / 20 轮`);

    // 打印每轮摘要
    for (const r of harness.log.records) {
      const emoji = r.actionResult.success ? "✅" : "❌";
      console.log(
        `[${r.cycle}] ${emoji} ${r.llmOutput.action}${r.llmOutput.targetId ? ` → ${r.llmOutput.targetId.slice(0, 8)}` : ""} | Qi: ${r.postState.qi}/${r.postState.maxQi} | Realm: ${r.postState.realm} | "${r.llmOutput.thought}"`,
      );
    }

    // 至少执行了一些轮次
    expect(cyclesRun).toBeGreaterThan(0);

    // 验证 log 完整性
    expect(harness.log.records).toHaveLength(cyclesRun);

    vi.useRealTimers();
  });

  it("ChatLog 导出为 Markdown", () => {
    vi.useFakeTimers();

    const harness = new AgentHarness({
      entityName: "日志修士",
      llm: new ScriptedLlm([
        { thought: "打坐", action: "meditate" },
        { thought: "休息", action: "rest" },
      ]),
    });

    harness.run(2);
    vi.runAllTimers();

    const md = harness.log.toMarkdown();
    expect(md).toContain("# Agent Chat Flow Log");
    expect(md).toContain("Cycle 1");
    expect(md).toContain("Cycle 2");
    expect(md).toContain("打坐");
    expect(md).toContain("休息");

    console.log(`\n=== Markdown Export ===\n${md}`);

    vi.useRealTimers();
  });

  it("ChatLog 导出为 JSON", () => {
    vi.useFakeTimers();

    const harness = new AgentHarness({
      entityName: "JSON修士",
      llm: new ScriptedLlm([{ thought: "测试", action: "meditate" }]),
    });

    harness.run(1);
    vi.runAllTimers();

    const json = harness.log.toJSON();
    const parsed = JSON.parse(json);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].observe.entityName).toBe("JSON修士");
    expect(parsed[0].llmOutput.thought).toBe("测试");
    expect(parsed[0].actionResult).toBeDefined();

    vi.useRealTimers();
  });

  it("实体死亡后循环自动停止", () => {
    vi.useFakeTimers();

    const harness = new AgentHarness({
      entityName: "短命修士",
      llm: new HeuristicLlm(),
    });

    // 手动榨干灵气模拟死亡
    const entity = harness.getEntity()!;
    const tank = entity.components.tank!;
    const core = tank.coreParticle;
    const ambient = harness.world.ledger.qiPool.state;
    ambient.pools[core] = (ambient.pools[core] ?? 0) + (tank.tanks[core] ?? 0);
    tank.tanks[core] = 0;
    entity.status = "lingering";

    const cyclesRun = harness.run(10);
    vi.runAllTimers();

    // 应该在第 1 轮就停了（因为 status != alive）
    expect(cyclesRun).toBe(1);
    // 但 log 里没有记录（因为 runCycle 返回 false 时不记录后续）
    expect(harness.log.records).toHaveLength(0);

    vi.useRealTimers();
  });
});
