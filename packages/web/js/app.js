// ============================================================
// Frontend App — WebSocket client + State-driven DOM rendering
// ============================================================

import { ParticleSystem } from "./particles.js";

// Derive URLs from current page location so it works with port forwarding, proxies, etc.
const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
const API_URL = `${window.location.protocol}//${window.location.host}`;
const MAX_LOG_ENTRIES = 200;

// ── State Management ────────────────────────────────────
const state = {
  connected: false,
  ambientPool: { pools: { ql: 0, qs: 0 }, total: 0 },
  entities: [],
  graveyard: [],
  logs: [],
  focusedEntityId: null,
  activeTab: "global", // 'global' or 'personal'
};

let particles = null;

// ── DOM Cache ───────────────────────────────────────────
const DOM = {
  statusText: document.querySelector(".status-text"),
  statusIndicator: document.getElementById("connection-status"),

  // Global View
  glbTick: document.getElementById("glb-tick"),
  valAmbientQi: document.getElementById("val-ambient-qi"),
  valEntityQi: document.getElementById("val-entity-qi"),
  valLingQi: document.getElementById("val-ling-qi"),
  valShaQi: document.getElementById("val-sha-qi"),
  valTotalQi: document.getElementById("val-total-qi"),

  sliceAmbientQi: document.getElementById("slice-ambient-qi"),
  sliceEntityQi: document.getElementById("slice-entity-qi"),
  sliceLingQi: document.getElementById("slice-ling-qi"),
  sliceShaQi: document.getElementById("slice-sha-qi"),

  glbPopTotal: document.getElementById("glb-pop-total"),
  leaderboardList: document.getElementById("leaderboard-list"),

  // Focus View
  focusTitle: document.getElementById("focus-title"),
  jindanLiquid: document.getElementById("jindan-liquid"),
  focusQi: document.getElementById("focus-qi"),
  focusMaxQi: document.getElementById("focus-max-qi"),
  focusQiPercent: document.getElementById("focus-qi-percent"),
  focusPower: document.getElementById("focus-power"),
  focusRealm: document.getElementById("focus-realm"),

  // Graveyard
  graveyardList: document.getElementById("graveyard-list"),

  // Logs
  logGlobal: document.getElementById("log-global"),
  logPersonal: document.getElementById("log-personal"),
  tabBtns: document.querySelectorAll(".tab-btn"),
};

// ── WebSocket ───────────────────────────────────────────
let ws;
let reconnectTimer;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 5000;

function connect() {
  console.log(`[WS] Connecting to ${WS_URL} ...`);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log(`[WS] ✅ Connected!`);
    state.connected = true;
    reconnectDelay = 1000; // reset backoff on success
    updateConnectionStatus();
    clearTimeout(reconnectTimer);
  };

  ws.onclose = (e) => {
    console.log(
      `[WS] ❌ Closed (code=${e.code}, reason=${e.reason}), retry in ${reconnectDelay}ms`,
    );
    state.connected = false;
    updateConnectionStatus();
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
  };

  ws.onerror = (e) => {
    console.error(`[WS] ⚠️ Error:`, e);
    ws.close();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "world_snapshot" || data.type === "tick_complete") {
      updateWorldState(data.data);
      render();
    } else {
      processLogEvent(data);
    }
  };
}

// Reconnect when user returns to tab
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.connected) {
    clearTimeout(reconnectTimer);
    connect();
  }
});

function updateConnectionStatus() {
  if (state.connected) {
    DOM.statusText.textContent = "灵网相连";
    DOM.statusIndicator.className = "status-indicator connected";
  } else {
    DOM.statusText.textContent = "灵网断接";
    DOM.statusIndicator.className = "status-indicator disconnected";
  }
}

// ── State Updates ───────────────────────────────────────
function updateWorldState(snapshot) {
  state.tick = snapshot.tick;
  if (snapshot.ambientPool) state.ambientPool = snapshot.ambientPool;
  if (snapshot.entities) state.entities = snapshot.entities;

  // Auto focus #1 if nothing focused
  if (!state.focusedEntityId && state.entities.length > 0) {
    const topCultivator = state.entities
      .filter((e) => e.species === "human")
      .sort((a, b) => getPower(b) - getPower(a))[0];
    if (topCultivator) {
      setFocus(topCultivator.id);
    }
  }
}

function setFocus(id) {
  state.focusedEntityId = id;
  renderFocus();
  renderPersonalLogs();
  renderLeaderboard(); // to show highlight
}

// ── Render Helpers ──────────────────────────────────────

function getPower(e) {
  return e.components?.combat?.power || 0;
}
function getRealm(e) {
  return e.components?.cultivation?.realm || 0;
}
function getQi(e) {
  const core = e.components?.tank?.coreParticle;
  return core ? e.components?.tank?.tanks[core] || 0 : 0;
}
function getMaxQi(e) {
  const core = e.components?.tank?.coreParticle;
  return core ? e.components?.tank?.maxTanks[core] || 1 : 1;
}

function formatNum(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function getRealmName(realmNum) {
  const realms = [
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
  return realms[realmNum] || `${realmNum} 阶`;
}

// ── Render ──────────────────────────────────────────────

function render() {
  if (!particles) {
    particles = new ParticleSystem("particle-canvas");
  }

  // Global Stats
  DOM.glbTick.textContent = state.tick;

  const aliveEntities = state.entities.filter((e) => e.status === "alive");
  const sentientAlive = aliveEntities.filter((e) => e.sentient).length;
  const wildCreatures = aliveEntities.filter((e) => !e.sentient).length;
  const domTotal = document.getElementById("glb-pop-total");
  if (domTotal) domTotal.textContent = `${sentientAlive} 灵 / ${wildCreatures} 兽`;

  // Qi Rendering
  const ambientQiInfo = state.ambientPool.pools.ql || 0;
  const shaQiInfo = Math.abs(state.ambientPool.pools.qs || 0);

  // Calculate Entity Qi
  let entityQiTotal = 0;
  if (state.entities) {
    for (const e of state.entities) {
      if (e.status === "alive" && e.components) {
        if (e.components.tank?.coreParticle && e.components.tank.tanks) {
          entityQiTotal += e.components.tank.tanks[e.components.tank.coreParticle] || 0;
        } else if (e.components.cultivation) {
          entityQiTotal += e.components.cultivation.currentQi || 0;
        }
      }
    }
  }

  const outerTotal = ambientQiInfo + entityQiTotal || 1;
  const lingQiInfo = ambientQiInfo + entityQiTotal;
  const innerTotal = lingQiInfo + shaQiInfo || 1;
  const universeTotal = outerTotal + shaQiInfo;

  // Update Texts
  if (DOM.valAmbientQi) DOM.valAmbientQi.textContent = formatNum(ambientQiInfo);
  if (DOM.valEntityQi) DOM.valEntityQi.textContent = formatNum(entityQiTotal);
  if (DOM.valLingQi) DOM.valLingQi.textContent = formatNum(lingQiInfo);
  if (DOM.valShaQi) DOM.valShaQi.textContent = formatNum(shaQiInfo);
  if (DOM.valTotalQi) DOM.valTotalQi.textContent = formatNum(universeTotal);

  // Outer Ring (Radius=55, C=345.57)
  const outerC = 345.57;
  const ratioAmbient = Math.max(0, Math.min(1, ambientQiInfo / outerTotal));
  const ratioEntity = Math.max(0, Math.min(1, entityQiTotal / outerTotal));

  if (DOM.sliceAmbientQi) {
    DOM.sliceAmbientQi.style.strokeDasharray = `${ratioAmbient * outerC} ${outerC}`;
    DOM.sliceAmbientQi.style.strokeDashoffset = 0;
  }
  if (DOM.sliceEntityQi) {
    DOM.sliceEntityQi.style.strokeDasharray = `${ratioEntity * outerC} ${outerC}`;
    DOM.sliceEntityQi.style.strokeDashoffset = -(ratioAmbient * outerC);
  }

  // Inner Ring (Radius=38, C=238.76)
  const innerC = 238.76;
  const ratioLing = Math.max(0, Math.min(1, lingQiInfo / innerTotal));
  const ratioSha = Math.max(0, Math.min(1, shaQiInfo / innerTotal));

  if (DOM.sliceLingQi) {
    DOM.sliceLingQi.style.strokeDasharray = `${ratioLing * innerC} ${innerC}`;
    DOM.sliceLingQi.style.strokeDashoffset = 0;
  }
  if (DOM.sliceShaQi) {
    DOM.sliceShaQi.style.strokeDasharray = `${ratioSha * innerC} ${innerC}`;
    DOM.sliceShaQi.style.strokeDashoffset = -(ratioLing * innerC);
  }

  if (particles) {
    particles.setIntensity(ambientQiInfo, shaQiInfo, universeTotal);
    particles.setEntities(state.entities || []);
  }

  renderLeaderboard();
  renderFocus();
}

function renderLeaderboard() {
  if (state.entities.length === 0) {
    DOM.leaderboardList.innerHTML = '<div class="empty-state">天地初开，暂无天骄</div>';
    return;
  }

  // Filter: only sentient (AI-played) alive entities for leaderboard
  const cultivators = state.entities
    .filter((e) => e.status === "alive" && e.sentient)
    .sort((a, b) => {
      const realmDiff = getRealm(b) - getRealm(a);
      return realmDiff !== 0 ? realmDiff : getPower(b) - getPower(a);
    });

  let html = "";
  cultivators.forEach((c, i) => {
    const isFocused = c.id === state.focusedEntityId;
    const rankClass = i < 3 ? `rank-${i + 1}` : "";

    html += `
      <div class="leader-card ${rankClass} ${isFocused ? "focused" : ""}" data-id="${c.id}">
        <div class="l-name">
          <span class="rank-badge">${i + 1}</span>
          ${c.species === "plant" ? "🌿" : c.species === "beast" ? "🐗" : "🧔"} ${c.name}
        </div>
        <div class="l-realm">${getRealmName(getRealm(c))}</div>
        <div class="l-power">⚔️ ${formatNum(getPower(c))}</div>
      </div>
    `;
  });

  DOM.leaderboardList.innerHTML = html;

  // Attach click listeners to cards
  const cards = DOM.leaderboardList.querySelectorAll(".leader-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      setFocus(card.dataset.id);
    });
  });
}

function renderFocus() {
  const entity = state.entities.find((e) => e.id === state.focusedEntityId);

  if (!entity) {
    DOM.focusTitle.textContent = "内观: 万物寂灭";
    DOM.jindanLiquid.style.height = "0%";
    DOM.focusQi.textContent = "0";
    DOM.focusMaxQi.textContent = "0";
    DOM.focusQiPercent.textContent = "0%";
    DOM.focusPower.textContent = "0";
    DOM.focusRealm.textContent = "虚无";
    return;
  }

  DOM.focusTitle.textContent = `内观: ${entity.name}`;

  const currentQi = getQi(entity);
  const maxQi = getMaxQi(entity);
  const percent = Math.floor((currentQi / maxQi) * 100);

  DOM.focusQi.textContent = formatNum(currentQi);
  DOM.focusMaxQi.textContent = formatNum(maxQi);
  DOM.focusQiPercent.textContent = `${Math.min(100, percent)}%`;

  // Sphere animation liquid fill
  DOM.jindanLiquid.style.height = `${Math.min(100, Math.max(0, percent))}%`;

  DOM.focusPower.textContent = formatNum(getPower(entity));
  DOM.focusRealm.textContent = getRealmName(getRealm(entity));
}

// ── Event Logs ──────────────────────────────────────────
function processLogEvent(event) {
  if (event.type === "tick_complete" || event.type === "world_snapshot") return;

  state.logs.unshift(event);
  if (state.logs.length > MAX_LOG_ENTRIES) {
    state.logs.pop();
  }

  // Prepend to DOM immediately instead of full re-render
  const el = createLogElement(event);
  DOM.logGlobal.insertBefore(el, DOM.logGlobal.firstChild);

  while (DOM.logGlobal.children.length > MAX_LOG_ENTRIES) {
    DOM.logGlobal.removeChild(DOM.logGlobal.lastChild);
  }

  // If relates to focused entity, also append to personal
  if (state.focusedEntityId) {
    const focused = state.entities.find((e) => e.id === state.focusedEntityId);
    if (focused && event.message.includes(focused.name)) {
      const pEl = createLogElement(event);
      DOM.logPersonal.insertBefore(pEl, DOM.logPersonal.firstChild);

      const emptyMsg = DOM.logPersonal.querySelector(".empty-log");
      if (emptyMsg) emptyMsg.remove();
    }
  }
}

function createLogElement(event) {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.dataset.type = event.type;

  // Bold out entity names roughly using regex or just render message directly
  div.innerHTML = `<span class="log-tick">[日 ${event.tick}]</span><span class="log-message">${event.message}</span>`;
  return div;
}

function renderPersonalLogs() {
  DOM.logPersonal.innerHTML = "";
  if (!state.focusedEntityId) {
    DOM.logPersonal.innerHTML =
      '<div class="empty-log">请先在天骄榜点击一名修仙者，以探寻其仙缘轨迹。</div>';
    return;
  }

  const focused = state.entities.find((e) => e.id === state.focusedEntityId);
  if (!focused) return;

  const relevant = state.logs.filter((e) => e.message.includes(focused.name));
  if (relevant.length === 0) {
    DOM.logPersonal.innerHTML = '<div class="empty-log">清净无为，暂无波澜起伏。</div>';
    return;
  }

  relevant.forEach((event) => {
    DOM.logPersonal.appendChild(createLogElement(event));
  });
}

// ── Tab Listeners ───────────────────────────────────────
DOM.tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    DOM.tabBtns.forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    // Switch view
    const target = btn.dataset.tab;
    state.activeTab = target;

    DOM.logGlobal.classList.remove("active");
    DOM.logPersonal.classList.remove("active");

    if (target === "global") DOM.logGlobal.classList.add("active");
    else DOM.logPersonal.classList.add("active");
  });
});

// ── Graveyard ───────────────────────────────────────────

function fetchGraveyard() {
  fetch(`${API_URL}/graveyard`)
    .then((r) => r.json())
    .then((data) => {
      if (Array.isArray(data)) {
        state.graveyard = data;
        renderGraveyard();
      }
    })
    .catch(() => {});
}

function renderGraveyard() {
  if (!DOM.graveyardList) return;

  if (state.graveyard.length === 0) {
    DOM.graveyardList.innerHTML =
      '<div class="empty-state graveyard-empty">天地太平，尚无英灵长眠于此</div>';
    return;
  }

  const speciesEmoji = { human: "🧔", beast: "🐗", plant: "🌿" };
  const statusLabel = { lingering: "👻 游魂", entombed: "🪦 安息" };

  let html = "";
  for (const group of state.graveyard) {
    const lives = group.lives || [group]; // backward compat: flat item fallback
    const latest = lives[lives.length - 1] || lives[0];
    const pastLives = lives.slice(0, -1);
    const emoji = speciesEmoji[latest.species] || "❓";
    const badge = statusLabel[latest.status] || latest.status;
    const epitaphText = latest.epitaph
      ? latest.epitaph.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
      : "";
    const lifeCount = lives.length;
    const soulId = group.soulId || latest.id;

    html += `<div class="tomb-soul-group" data-soul="${soulId}">`;

    // Main tombstone (latest life)
    html += `
      <div class="tomb-card ${latest.status}">
        <div class="tomb-header">
          <span class="tomb-name">${emoji} ${latest.name}</span>
          <span class="tomb-status-badge ${latest.status}">${badge}</span>
        </div>
        <div class="tomb-species">${latest.species}${lifeCount > 1 ? ` · 第${lifeCount}世` : ""}</div>
        <div class="tomb-epitaph">${epitaphText}</div>
      </div>`;

    // Past lives (collapsed by default)
    if (pastLives.length > 0) {
      html += `
        <div class="tomb-past-toggle" onclick="this.classList.toggle('expanded');this.nextElementSibling.classList.toggle('show')">
          ▸ 前世轮回 (${pastLives.length}世)
        </div>
        <div class="tomb-past-lives">`;

      for (const past of pastLives.reverse()) {
        const pEmoji = speciesEmoji[past.species] || "❓";
        const pBadge = statusLabel[past.status] || past.status;
        const pEpitaph = past.epitaph
          ? past.epitaph.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
          : "";

        html += `
          <div class="tomb-card past-life ${past.status}">
            <div class="tomb-header">
              <span class="tomb-name">${pEmoji} ${past.name}</span>
              <span class="tomb-status-badge ${past.status}">${pBadge}</span>
            </div>
            <div class="tomb-epitaph">${pEpitaph}</div>
          </div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  DOM.graveyardList.innerHTML = html;
}

// ── Init ────────────────────────────────────────────────
console.log(`[Init] API_URL=${API_URL}, WS_URL=${WS_URL}`);
connect();

fetch(`${API_URL}/world/status`)
  .then((r) => r.json())
  .then((data) => {
    console.log(`[Init] HTTP fetch OK, tick=${data.tick}, entities=${data.entities?.length}`);
    updateWorldState(data);
    render();
    fetchGraveyard();
  })
  .catch((err) => console.error("[Init] HTTP fetch failed:", err));

// Poll graveyard every 5 seconds instead of every tick
setInterval(fetchGraveyard, 5000);
