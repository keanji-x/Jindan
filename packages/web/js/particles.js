// ============================================================
// Particle System (Canvas) - With Entity Graph Networking
// ============================================================

export class ParticleSystem {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    // Ambient Atmosphere Particles
    this.particles = [];
    this.targetQiParticles = 0;
    this.targetShaParticles = 0;

    // Entity Node Graph
    this.entityNodes = new Map();

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  // Called from app.js when state updates
  setIntensity(currentQi, currentSha, totalQi) {
    // Adjust total density based on both qi and sha
    const qiRatio = Math.max(0, Math.min(1, currentQi / (totalQi || 1)));
    const shaRatio = Math.max(0, Math.min(1, Math.abs(currentSha) / (totalQi || 1)));

    this.targetQiParticles = Math.floor(qiRatio * 400); // 400 particles for better effect
    this.targetShaParticles = Math.floor(shaRatio * 400);
  }

  setEntities(entities) {
    const currentIds = new Set();

    // Create or update nodes for alive entities
    for (const e of entities) {
      if (!e.alive) continue;
      currentIds.add(e.id);

      if (!this.entityNodes.has(e.id)) {
        // Spawn new entity node randomly on screen
        this.entityNodes.set(e.id, {
          id: e.id,
          name: e.name,
          species: e.species,
          realm: e.components?.cultivation?.realm || 0,
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
        });
      } else {
        // Update stats
        const node = this.entityNodes.get(e.id);
        node.realm = e.components?.cultivation?.realm || 0;
      }
    }

    // Remove dead entities
    for (const [id] of this.entityNodes) {
      if (!currentIds.has(id)) {
        this.entityNodes.delete(id);
      }
    }
  }

  spawnParticle(type) {
    const isSha = type === "sha";
    return {
      x: Math.random() * this.width,
      y: this.height + Math.random() * 100, // spawn slightly below the screen
      size: Math.random() * 2.5 + 1.5, // 1.5 to 4px
      speedY: Math.random() * 1.5 + 0.5, // Move up faster
      speedX: (Math.random() - 0.5) * 1.2, // More horizontal drift
      opacity: Math.random() * 0.5 + 0.3, // Brighter particles
      color: isSha
        ? Math.random() > 0.5
          ? "#f43f5e"
          : "#9333ea"
        : Math.random() > 0.2
          ? "#38bdf8"
          : "#fbbf24",
      type: type,
      life: 0,
      maxLife: Math.random() * 100 + 200, // Faster fading, quicker turnover
    };
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // ==========================================
    // 1. Render Ambient Background Particles
    // ==========================================
    const currentQiStrands = this.particles.filter((p) => p.type !== "sha").length;
    const currentShaStrands = this.particles.filter((p) => p.type === "sha").length;

    if (currentQiStrands < this.targetQiParticles && Math.random() < 0.6) {
      if (currentQiStrands < 600) this.particles.push(this.spawnParticle("qi"));
    }
    if (currentShaStrands < this.targetShaParticles && Math.random() < 0.6) {
      if (currentShaStrands < 600) this.particles.push(this.spawnParticle("sha"));
    }

    const { ctx } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.speedX;
      p.y -= p.speedY; // move up
      p.life++;

      // Fade out at end of life or top of screen
      let currentOpacity = p.opacity;
      if (p.life > p.maxLife * 0.8) {
        currentOpacity *= (p.maxLife - p.life) / (p.maxLife * 0.2);
      }
      if (p.y < 0) {
        currentOpacity = 0;
        p.life = p.maxLife; // Force kill next frame
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${Math.floor(Math.max(0, currentOpacity) * 255)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = p.color;
      ctx.fill();

      // Remove dead particles
      if (p.life >= p.maxLife || p.y < -50) {
        this.particles.splice(i, 1);
      }
    }

    // ==========================================
    // 2. Render Entity Network Graph
    // ==========================================
    const nodes = Array.from(this.entityNodes.values());

    // Move nodes
    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off bounds loosely
      if (node.x < -50 || node.x > this.width + 50) node.vx *= -1;
      if (node.y < -50 || node.y > this.height + 50) node.vy *= -1;
    }

    // Draw lines between close nodes
    const connectDistance = 300; // max distance to draw a line

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i];
        const n2 = nodes[j];
        const dx = n1.x - n2.x;
        const dy = n1.y - n2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectDistance) {
          const opacity = Math.max(0, 1 - dist / connectDistance);
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          // The network line is a subtle glowing strand
          ctx.strokeStyle = `rgba(148, 163, 184, ${opacity * 0.4})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // Draw actual nodes
    for (const node of nodes) {
      // Node color mapping
      let color = "#e2e8f0"; // Default text color
      if (node.species === "human")
        color = "#fbbf24"; // Gold
      else if (node.species === "beast")
        color = "#f43f5e"; // Red
      else if (node.species === "plant") color = "#10b981"; // Green

      const size = 3 + node.realm * 1.5; // Higher realm = exponentially bigger node

      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.fill();

      // Draw name label below the node
      ctx.shadowBlur = 0;
      ctx.font = '11px "Noto Serif SC", serif';
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.textAlign = "center";
      ctx.fillText(node.name, node.x, node.y + size + 16);
    }

    requestAnimationFrame(this.animate);
  }
}
