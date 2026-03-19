// ============================================================
// Frontend App — WebSocket client + State-driven DOM rendering
// ============================================================

const WS_URL = "ws://localhost:3001";
const API_URL = "http://localhost:3001";
const MAX_LOG_ENTRIES = 200;

// ── State Management ────────────────────────────────────
const state = {
  connected: false,
  ambientPool: { pools: { ql: 0, qs: 0 }, total: 0 },
  entities: [],
  logs: [],
  focusedEntityId: null,
  activeTab: "global", // 'global' or 'personal'
};

// ── DOM Cache ───────────────────────────────────────────
const DOM = {
  statusText: document.querySelector(".status-text"),
  statusIndicator: document.getElementById("connection-status"),

  // Global View
  glbTick: document.getElementById("glb-tick"),
  glbAmbientQi: document.getElementById("glb-ambient-qi"),
  qiRingFill: document.getElementById("qi-ring-fill"),
  glbPopCultivators: document.getElementById("glb-pop-cultivators"),
  glbPopBeasts: document.getElementById("glb-pop-beasts"),
  leaderboardList: document.getElementById("leaderboard-list"),

  // Focus View
  focusTitle: document.getElementById("focus-title"),
  jindanLiquid: document.getElementById("jindan-liquid"),
  focusQi: document.getElementById("focus-qi"),
  focusMaxQi: document.getElementById("focus-max-qi"),
  focusQiPercent: document.getElementById("focus-qi-percent"),
  focusPower: document.getElementById("focus-power"),
  focusRealm: document.getElementById("focus-realm"),

  // Logs
  logGlobal: document.getElementById("log-global"),
  logPersonal: document.getElementById("log-personal"),
  tabBtns: document.querySelectorAll(".tab-btn"),
};

// ── WebSocket ───────────────────────────────────────────
let ws;
let reconnectTimer;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    state.connected = true;
    updateConnectionStatus();
    clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    state.connected = false;
    updateConnectionStatus();
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();

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
  // Global Stats
  DOM.glbTick.textContent = state.tick;
  DOM.glbAmbientQi.textContent = formatNum(state.ambientPool.pools.ql || 0);

  const popCult = state.entities.filter((e) => e.species === "human").length;
  const popBeast = state.entities.filter((e) => e.species === "beast").length;
  DOM.glbPopCultivators.textContent = popCult;
  DOM.glbPopBeasts.textContent = popBeast;

  // Qi Ring Animation
  const totalQiVal = state.ambientPool.total || 1;
  const currQiVal = state.ambientPool.pools.ql || 0;
  const p = Math.max(0, Math.min(1, currQiVal / totalQiVal));
  const offset = 283 - 283 * p; // 283 is circumference
  DOM.qiRingFill.style.strokeDashoffset = offset;

  renderLeaderboard();
  renderFocus();
}

function renderLeaderboard() {
  if (state.entities.length === 0) {
    DOM.leaderboardList.innerHTML = '<div class="empty-state">天地初开，暂无天骄</div>';
    return;
  }

  // Filter only humans for the leaderboard, sort by Realm, then Power
  const cultivators = state.entities
    .filter((e) => e.species === "human")
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
          ${c.name}
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

// ── Init ────────────────────────────────────────────────
connect();

fetch(`${API_URL}/world/status`)
  .then((r) => r.json())
  .then((data) => {
    updateWorldState(data);
    render();
  })
  .catch(() => console.log("Initial HTTP fetch failed"));
