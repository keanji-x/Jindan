import { useState } from "react";
import CharacterPanel from "../components/CharacterPanel";
import ChatPanel from "../components/ChatPanel";
import WorldPanel from "../components/WorldPanel";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { username, logout, characters } = useAuth();
  const [activeCharId, setActiveCharId] = useState<string | null>(null);
  const [chatSecret, setChatSecret] = useState<string | null>(null);

  // Find active character for sidebar display
  const activeChar = characters.find((c) => c.entityId === activeCharId);

  function handleSelectCharacter(entityId: string, secret: string) {
    setActiveCharId(entityId);
    setChatSecret(secret);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content — 2/3 column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Character management */}
        <aside className="w-72 border-r border-white/[0.06] flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">{username}</span>
              <button
                type="button"
                onClick={logout}
                className="text-xs text-slate-500 hover:text-danger transition-colors"
              >
                退出
              </button>
            </div>
          </div>
          <CharacterPanel activeCharId={activeCharId} onSelect={handleSelectCharacter} />
        </aside>

        {/* Center: World dashboard (full width, scrollable) */}
        <main className="flex-1 overflow-y-auto">
          <WorldPanel activeEntityId={activeCharId} />
        </main>

        {/* Right: Chat (only visible when character selected) */}
        {activeCharId && chatSecret && (
          <aside className="w-96 border-l border-white/[0.06] flex-shrink-0 flex flex-col">
            <ChatPanel
              key={activeCharId}
              entityId={activeCharId}
              secret={chatSecret}
              characterName={activeChar?.name || "未知"}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
