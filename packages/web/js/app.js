// ============================================================
// Frontend App — WebSocket client + DOM rendering
// ============================================================

const WS_URL = "ws://localhost:3001";
const API_URL = "http://localhost:3001";
const MAX_LOG_ENTRIES = 200;

let ws;
let reconnectTimer;

// ── WebSocket ──────────────────────────────────────────

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnectionStatus(true);
    clearTimeout(reconnectTimer);
  };

  ws.onclose = () => {
    setConnectionStatus(false);
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "world_snapshot") {
      renderWorldSnapshot(data.data);
    } else if (data.type === "tick_complete") {
      renderWorldSnapshot(data.data);
    } else {
      appendLogEntry(data);
    }
  };
}

function setConnectionStatus(connected) {
  const el = document.getElementById("connection-status");
  el.textContent = connected ? "已连接" : "未连接";
  el.className = connected ? "status-connected" : "status-disconnected";
}

// ── Render World ────────────────────────────────────────

function renderWorldSnapshot(snapshot) {
  // Tick
  document.getElementById("tick").textContent = snapshot.tick;

  // Resources
  const res = snapshot.resources;
  if (res) {
    const vein = res.spiritVein;
    const qi = res.ambientQi;

    document.getElementById("vein-remaining").textContent =
      `${formatNum(vein.remaining)} / ${formatNum(vein.maxCapacity)}`;
    document.getElementById("vein-bar").style.width =
      `${(vein.remaining / vein.maxCapacity) * 100}%`;

    document.getElementById("ambient-qi").textContent =
      `${formatNum(qi.current)} / ${formatNum(qi.capacity)}`;
    document.getElementById("qi-bar").style.width = `${(qi.current / qi.capacity) * 100}%`;

    document.getElementById("unclaimed-stones").textContent = formatNum(res.unclaimedStones);
  }

  // Cultivators
  if (snapshot.cultivators) {
    renderCultivators(snapshot.cultivators);
  }

  // Beasts
  if (snapshot.beasts) {
    renderBeasts(snapshot.beasts);
  }
}

function renderCultivators(cultivators) {
  const container = document.getElementById("cultivator-list");
  if (cultivators.length === 0) {
    container.innerHTML = '<div class="entity-detail">暂无修士入世</div>';
    return;
  }

  container.innerHTML = cultivators
    .sort((a, b) => b.realm * 100 + b.power - (a.realm * 100 + a.power))
    .map(
      (c) => `
      <div class="entity-card">
        <div>
          <div class="entity-name">${c.name}</div>
          <div class="entity-detail">
            ${c.realm}阶 │ 经验 ${c.exp}/${c.expToNext} │ 灵力 ${c.qi}/${c.maxQi} │ 💎${c.spiritStones} │ 寿${c.age}/${c.lifespan}
          </div>
        </div>
        <div class="entity-power">⚔️ ${c.power}</div>
      </div>
    `,
    )
    .join("");
}

function renderBeasts(beasts) {
  const container = document.getElementById("beast-list");
  if (beasts.length === 0) {
    container.innerHTML = '<div class="entity-detail">附近没有妖兽</div>';
    return;
  }

  container.innerHTML = beasts
    .sort((a, b) => b.rank - a.rank)
    .map(
      (b) => `
      <div class="entity-card">
        <div>
          <div class="entity-name">${b.name}</div>
          <div class="entity-detail">
            ${b.rank}阶 │ 妖丹 💎${b.coreSpiritStones} │ 寿${b.age}/${b.lifespan}
          </div>
        </div>
        <div class="entity-power">⚔️ ${b.power}</div>
      </div>
    `,
    )
    .join("");
}

// ── Event Log ────────────────────────────────────────────

function appendLogEntry(event) {
  // Skip tick_complete (already handled as snapshot) and vein_output (noisy)
  if (event.type === "tick_complete" || event.type === "vein_output") return;

  const log = document.getElementById("event-log");

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.dataset.type = event.type;
  entry.innerHTML = `<span class="log-tick">[${event.tick}]</span>${event.message}`;

  // Prepend (newest first)
  log.insertBefore(entry, log.firstChild);

  // Cap log length
  while (log.children.length > MAX_LOG_ENTRIES) {
    log.removeChild(log.lastChild);
  }
}

// ── Helpers ──────────────────────────────────────────────

function formatNum(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Init ─────────────────────────────────────────────────

connect();

// Also fetch initial state via HTTP (in case WebSocket is slow)
fetch(`${API_URL}/world/status`)
  .then((r) => r.json())
  .then(renderWorldSnapshot)
  .catch(() => {});
