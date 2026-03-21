import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { charAttach, type EntityData, getEntities } from "../api/client";
import { useAuth } from "../context/AuthContext";

const SPECIES = [
  { id: "human", icon: "🧔", label: "人族" },
  { id: "beast", icon: "🐗", label: "妖兽" },
  { id: "plant", icon: "🌿", label: "灵植" },
] as const;

const REALM_NAMES = [
  "凡人",
  "炼气",
  "筑基",
  "金丹",
  "元婴",
  "化神",
  "炼虚",
  "合体",
  "大乘",
  "渡劫",
  "真仙",
];

export default function EntityConfigPage() {
  const { token, characters, addCharacter } = useAuth();
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const fetchEntities = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEntities();
      setEntities(data);
      setError("");
    } catch (_err) {
      setError("获取世界生灵失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  async function handleAttach(entityId: string, entityName: string, species: string) {
    if (!confirm(`确认要夺舍实体「${entityName}」吗？`)) return;
    setError("");
    setAttachingId(entityId);
    try {
      const data = await charAttach(token!, entityId, inviteCode);
      setNewSecret({ id: entityId, secret: data.secret });
      addCharacter({
        entityId: data.entityId,
        name: entityName,
        species: species || "human",
      });
      // save to local storage
      const stored = JSON.parse(localStorage.getItem("jindan_secrets") || "{}");
      stored[data.entityId] = data.secret;
      localStorage.setItem("jindan_secrets", JSON.stringify(stored));
    } catch (err) {
      setError(err instanceof Error ? err.message : "夺舍失败");
    }
    setAttachingId(null);
  }

  const ownedEntityIds = new Set(characters.map((c) => c.entityId));

  return (
    <div className="min-h-screen bg-void text-slate-300 p-8 flex flex-col items-center overflow-y-auto">
      <div className="w-full max-w-5xl space-y-6 animate-fade-in">
        <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-xl border border-white/[0.05]">
          <h1 className="text-xl font-bold text-qi">大千生灵 - 万物化生</h1>
          <Link
            to="/"
            className="text-sm border border-qi/30 text-qi px-4 py-2 rounded-lg hover:bg-qi/10 transition-colors"
          >
            返回控制台
          </Link>
        </div>

        {/* Creation Result Alert */}
        {newSecret && (
          <div className="bg-qi/10 border border-qi/40 rounded-xl p-5 space-y-3 animate-slide-up shadow-[0_0_30px_rgba(56,189,248,0.2)]">
            <div className="text-sm text-qi font-bold flex items-center gap-2">
              <span className="text-xl">✨</span> 夺舍成功！私钥已获取
            </div>
            <code className="block text-sm font-mono text-qi break-all select-all bg-black/40 rounded-lg p-3 border border-qi/20">
              {newSecret.secret}
            </code>
            <p className="text-xs text-slate-400">
              你已成功接管该生灵的躯壳与因果。该私钥已保存在你的浏览器中。
              <br />
              如果需要在外部 Agent 脚本中接入此躯壳，请复制这段私钥。
            </p>
            <button
              type="button"
              onClick={() => setNewSecret(null)}
              className="mt-2 text-xs px-4 py-2 rounded-lg bg-qi/20 text-qi hover:bg-qi/30 transition-colors font-bold"
            >
              已明晰，关闭
            </button>
          </div>
        )}

        {/* Invite Code Section */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 shadow-lg shadow-black/20 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-200">天地法度 (邀请码)</h2>
            <p className="text-xs text-slate-500 mt-1">
              若此界设有界壁保护，则夺舍需要填写正确的法度秘钥。
            </p>
          </div>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="填写法度秘钥 (若无需则留空)"
            className="w-full sm:w-64 bg-black/40 border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-qi focus:outline-none transition-all"
          />
        </div>

        {/* World Entities List */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden shadow-lg shadow-black/20">
          <div className="p-6 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
            <div>
              <h2 className="text-lg font-bold text-slate-200">在世生灵</h2>
              <p className="text-xs text-slate-500 mt-1">
                此界自然化生之万灵。你可以自由选择无主之物进行「夺舍」。
              </p>
            </div>
            <button
              type="button"
              onClick={fetchEntities}
              disabled={loading}
              className="text-xs border border-white/[0.1] text-slate-300 hover:text-qi hover:border-qi/50 px-3 py-1.5 rounded transition-colors"
            >
              {loading ? "洞察中..." : "刷新界域"}
            </button>
          </div>

          {error && (
            <div className="p-4 mx-6 mt-4 text-sm text-danger bg-danger/10 rounded-lg border border-danger/20">
              {error}
            </div>
          )}

          {entities.length === 0 && !loading ? (
            <div className="p-16 text-center text-slate-500 text-sm flex flex-col items-center gap-3">
              <span className="text-4xl opacity-50">🌌</span>
              世界空虚，尚无自然生灵在此界诞生...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-400 bg-black/40 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-medium">根脚 (物种)</th>
                    <th className="px-6 py-4 font-medium">尊号</th>
                    <th className="px-6 py-4 font-medium">道行</th>
                    <th className="px-6 py-4 font-medium">真灵 (Entity ID)</th>
                    <th className="px-6 py-4 font-medium text-right">天机流转</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {entities.map((e) => {
                    const isOwned = ownedEntityIds.has(e.id);
                    const isAttaching = attachingId === e.id;
                    const r = e.components?.cultivation?.realm || 0;

                    return (
                      <tr key={e.id} className="hover:bg-white/[0.03] transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-xl mr-3 inline-block drop-shadow-md">
                            {SPECIES.find((s) => s.id === e.species)?.icon || "✨"}
                          </span>
                          <span className="text-slate-300 font-medium">
                            {SPECIES.find((s) => s.id === e.species)?.label || e.species}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-200">
                          {e.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 rounded bg-qi/10 text-qi/90 border border-qi/20 text-xs shadow-inner">
                            {REALM_NAMES[r] || "初开"}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-500/80 text-xs tracking-wider group-hover:text-qi/60 transition-colors">
                          {e.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          {isOwned ? (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-qi/20 bg-qi/5 text-qi/80 text-xs shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                              已受控
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAttach(e.id, e.name, e.species || "human")}
                              disabled={isAttaching}
                              className="px-4 py-1.5 rounded-lg border border-qi/60 text-qi font-bold hover:bg-qi hover:text-black hover:shadow-[0_0_15px_rgba(56,189,248,0.5)] transition-all text-xs disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-qi"
                            >
                              {isAttaching ? "降临中..." : "夺舍"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
