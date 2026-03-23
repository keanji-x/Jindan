import { useCallback, useEffect, useRef, useState } from "react";
import { botAct, botChat, botLogin, type ChatResponse } from "../api/client";

interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  text: string;
  actions?: ChatResponse["suggestedActions"];
}

interface Props {
  entityId: string;
  secret: string;
  characterName: string;
}

export default function ChatPanel({ entityId, secret, characterName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [botToken, setBotToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdRef = useRef(0);

  // Auto-login to bot with secret
  // biome-ignore lint/correctness/useExhaustiveDependencies: addMessage is a local function, not a stable ref
  useEffect(() => {
    botLogin(secret)
      .then((data) => {
        setBotToken(data.token);
        addMessage("system", `已连接 ${characterName} 的潜意识。`);
      })
      .catch((err) => {
        setError(`连接失败: ${err.message}。私钥可能已过期，请前往「探索大千」重新夺舍。`);
      });
  }, [entityId, secret, characterName]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  // Auto-scroll when messages change or sending state changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to scroll on messages/sending changes
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, sending, scrollToBottom]);

  function addMessage(role: ChatMessage["role"], text: string, actions?: ChatMessage["actions"]) {
    const id = ++msgIdRef.current;
    setMessages((prev) => [...prev, { id, role, text, actions }]);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending || !botToken) return;

    setInput("");
    setSending(true);
    addMessage("user", text);

    try {
      const data = await botChat(botToken, text);
      addMessage("assistant", data.reply, data.suggestedActions);
    } catch (err) {
      addMessage("system", `通信失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }

    setSending(false);
    inputRef.current?.focus();
  }

  async function executeAction(action: string, targetId?: string) {
    if (!botToken) return;
    addMessage("system", `执行 ${action}...`);
    try {
      const result = await botAct(botToken, action, targetId);
      const r = result as { success?: boolean; error?: string };
      const msg = r.success ? `✅ ${action} 成功` : `❌ ${action} 失败: ${r.error || "未知"}`;
      addMessage("system", msg);
    } catch (err) {
      addMessage("system", `执行失败: ${err instanceof Error ? err.message : "未知"}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div className="text-sm font-bold text-slate-300">{characterName}</div>
        <div className="text-[10px] text-slate-500">潜意识对话</div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {error && (
          <div className="text-xs text-danger bg-danger/5 rounded-lg px-3 py-2">{error}</div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "system" ? (
              <div className="text-[11px] text-slate-500 bg-white/[0.02] rounded-lg px-3 py-1.5 w-full text-center">
                {msg.text}
              </div>
            ) : (
              <div className={`max-w-[85%] space-y-1.5`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-qi/15 text-slate-200 rounded-br-md"
                      : "bg-white/[0.05] text-slate-300 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
                {/* Suggested actions */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.actions.map((a) => (
                      <button
                        type="button"
                        key={`action-${a.action}`}
                        onClick={() => executeAction(a.action, a.targetId)}
                        title={a.description}
                        className="text-[10px] px-2 py-1 rounded-md bg-qi/5 text-qi border border-qi/15 hover:bg-qi/10 transition-colors"
                      >
                        ⚡ {a.action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white/[0.05] rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="对潜意识说..."
            rows={1}
            maxLength={500}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:border-qi/30 focus:outline-none transition-colors"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending || !botToken}
            className="p-2.5 rounded-xl bg-qi/15 text-qi hover:bg-qi/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <svg
              aria-label="发送消息"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
