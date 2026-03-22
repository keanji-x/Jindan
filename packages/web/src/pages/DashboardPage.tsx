import { useState } from "react";
import { Link } from "react-router-dom";
import type { CharacterInfo } from "../api/client";
import CharacterPanel from "../components/CharacterPanel";
import ChatPanel from "../components/ChatPanel";
import WorldPanel from "../components/WorldPanel";

/** 从 localStorage 读取已保存的角色列表 */
function loadCharacters(): CharacterInfo[] {
  try {
    const secrets = JSON.parse(localStorage.getItem("jindan_secrets") || "{}");
    const chars = JSON.parse(localStorage.getItem("jindan_characters") || "[]");
    return (chars as CharacterInfo[]).filter((c) => secrets[c.entityId]);
  } catch {
    return [];
  }
}

export default function DashboardPage() {
  const [characters, setCharacters] = useState<CharacterInfo[]>(loadCharacters);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);
  const [chatSecret, setChatSecret] = useState<string | null>(null);

  // Find active character for sidebar display
  const activeChar = characters.find((c) => c.entityId === activeCharId);

  function handleSelectCharacter(entityId: string, secret: string) {
    setActiveCharId(entityId);
    setChatSecret(secret);
  }

  function handleRemoveCharacter(entityId: string) {
    const updated = characters.filter((c) => c.entityId !== entityId);
    setCharacters(updated);
    localStorage.setItem("jindan_characters", JSON.stringify(updated));
    const secrets = JSON.parse(localStorage.getItem("jindan_secrets") || "{}");
    delete secrets[entityId];
    localStorage.setItem("jindan_secrets", JSON.stringify(secrets));
    if (activeCharId === entityId) {
      setActiveCharId(null);
      setChatSecret(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main content — 2/3 column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Character management */}
        <aside className="w-72 border-r border-white/[0.06] flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-qi font-bold">金丹</span>
              <Link to="/config" className="text-xs text-qi hover:text-qi/80 transition-colors">
                探索大千
              </Link>
            </div>
          </div>
          <CharacterPanel
            characters={characters}
            activeCharId={activeCharId}
            onSelect={handleSelectCharacter}
            onRemove={handleRemoveCharacter}
          />
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
