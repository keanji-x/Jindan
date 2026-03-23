import fs from "node:fs";
import path from "node:path";

export interface CycleRecord {
  cycle: number;
  status: string;
  observe: unknown;
  plan: unknown[];
  llmInput: { system: string; user: string };
  llmOutput: {
    thought: string;
    action: string;
    targetId?: string;
    raw: string;
  };
  actionResult: { success: boolean; error?: string; result?: unknown };
}

export interface ChatRecord {
  ts: string; // ISO timestamp
  chatId: string;
  incomingMessage: string;
  llmReply: string;
}

export class ChatLogger {
  readonly records: CycleRecord[] = [];
  readonly chatRecords: ChatRecord[] = [];
  private readonly logDir: string;
  private readonly jsonPath: string;
  private readonly mdPath: string;
  private readonly chatMdPath: string;

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
    this.chatMdPath = path.join(this.logDir, `${this.agentId}-conversations.md`);
  }

  push(record: CycleRecord) {
    this.records.push(record);
    this.flush();
  }

  /** 记录一次完整的 chat 问答 */
  pushChat(record: ChatRecord) {
    this.chatRecords.push(record);
    this.flushChat();
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

  private flushChat() {
    const lines: string[] = [`# 对话记录: ${this.agentId}\n`];
    for (const r of this.chatRecords) {
      lines.push(`## ${r.ts}`);
      lines.push(`**chatId**: \`${r.chatId}\``);
      lines.push(``);
      lines.push(`**📨 收到**:`);
      lines.push(`> ${r.incomingMessage}`);
      lines.push(``);
      lines.push(`**💬 回复**:`);
      lines.push(`> ${r.llmReply}`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
    fs.writeFileSync(this.chatMdPath, lines.join("\n"));
  }
}
