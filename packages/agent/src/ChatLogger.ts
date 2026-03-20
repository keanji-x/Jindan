import fs from "node:fs";
import path from "node:path";

export interface CycleRecord {
  cycle: number;
  status: string;
  observe: Record<string, unknown>;
  plan: Record<string, unknown>[];
  llmInput: { system: string; user: string };
  llmOutput: {
    thought: string;
    action: string;
    targetId?: string;
    raw: string;
  };
  actionResult: { success: boolean; error?: string; result?: unknown };
}

export class ChatLogger {
  readonly records: CycleRecord[] = [];
  private readonly logDir: string;
  private readonly jsonPath: string;
  private readonly mdPath: string;

  constructor(
    private readonly agentId: string,
    logDirPath = path.resolve(process.cwd(), "logs"),
  ) {
    this.logDir = logDirPath;
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.jsonPath = path.join(this.logDir, `${this.agentId}-chat.json`);
    this.mdPath = path.join(this.logDir, `${this.agentId}-chat.md`);
  }

  push(record: CycleRecord) {
    this.records.push(record);
    this.flush();
  }

  get recordCount(): number {
    return this.records.length;
  }

  private flush() {
    // Write JSON
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.records, null, 2));

    // Write Markdown
    const lines: string[] = [`# Agent Chat Flow Log: ${this.agentId}\n`];
    for (const r of this.records) {
      lines.push(`## Cycle ${r.cycle}`);
      lines.push(`- **Status**: ${r.status}`);
      lines.push(`- **Possible actions**: ${r.plan.length}`);
      lines.push(`- **LLM thought**: ${r.llmOutput.thought}`);
      lines.push(
        `- **Action**: ${r.llmOutput.action}${r.llmOutput.targetId ? ` → ${r.llmOutput.targetId}` : ""}`,
      );
      lines.push(`- **Result**: ${r.actionResult.success ? "✅" : `❌ ${r.actionResult.error}`}`);
      lines.push("");
    }
    fs.writeFileSync(this.mdPath, lines.join("\n"));
  }
}
