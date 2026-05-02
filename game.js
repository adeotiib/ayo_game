/**
 * AYO (Yoruba) — Traditional Nigerian Mancala
 * =============================================
 * Capture rule: last seed lands on opponent's side with exactly 2 or 3
 * seeds total → capture those seeds, then check backwards along the
 * opponent's row (chain capture) until a pit no longer has 2 or 3.
 * Grand-slam rule: never capture if it would empty opponent's entire side.
 * Feed rule: if opponent's side is empty, you must send seeds there.
 */

'use strict';

/* ================================================================
   CONSTANTS
   ================================================================ */
const TOTAL_PITS    = 12;
const SEEDS_PER_PIT = 4;

// Board layout (flat 12-slot array):
//   P1 pits: indices 0-5   (P1's side, left→right)
//   P2 pits: indices 6-11  (P2's side, index 6 is above P1's 5, 11 above P1's 0)
// Counter-clockwise sowing order: 0→1→2→3→4→5→6→7→8→9→10→11→0→…
const P1_PITS = [0, 1, 2, 3, 4, 5];
const P2_PITS = [6, 7, 8, 9, 10, 11];

/* ================================================================
   AUDIO ENGINE
   ================================================================ */
class AudioEngine {
  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this._init();
  }

  _init() {
    try {
      const AC = window.AudioContext || /** @type {any} */(window).webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      console.warn('Web Audio API not available.');
    }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playSeedDrop(index = 0) {
    if (!this.enabled || !this.ctx) return;
    this._resume();

    const t  = this.ctx.currentTime;
    const sr = this.ctx.sampleRate;
    // Randomise pitch and velocity so each drop sounds unique
    const pitch = 0.88 + Math.random() * 0.26;
    const vel   = 0.72 + Math.random() * 0.28;

    // ── Layer 1: hard impact click (≈8 ms) ───────────────────────
    // Linear-decay noise → high-pass filtered → sharp "tock" transient
    const cn  = Math.floor(sr * 0.008);
    const cbf = this.ctx.createBuffer(1, cn, sr);
    const cd  = cbf.getChannelData(0);
    for (let i = 0; i < cn; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cn);
    const cs  = this.ctx.createBufferSource();
    cs.buffer = cbf;
    const hpf = this.ctx.createBiquadFilter();
    hpf.type            = 'highpass';
    hpf.frequency.value = 2200;
    const cg  = this.ctx.createGain();
    cg.gain.value = vel * 0.35;
    cs.connect(hpf); hpf.connect(cg); cg.connect(this.ctx.destination);
    cs.start(t);

    // ── Layer 2: hollow pit ring (≈40 ms) ────────────────────────
    // Noise through a narrow bandpass → sounds like a wooden cavity
    const rn  = Math.floor(sr * 0.042);
    const rbf = this.ctx.createBuffer(1, rn, sr);
    const rd  = rbf.getChannelData(0);
    for (let i = 0; i < rn; i++)
      rd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rn * 0.14));
    const rs  = this.ctx.createBufferSource();
    rs.buffer = rbf;
    const bpf = this.ctx.createBiquadFilter();
    bpf.type            = 'bandpass';
    bpf.frequency.value = (400 + (index % 6) * 45) * pitch;
    bpf.Q.value         = 5;   // resonant but not musical
    const rg  = this.ctx.createGain();
    rg.gain.value = vel * 0.55;
    rs.connect(bpf); bpf.connect(rg); rg.connect(this.ctx.destination);
    rs.start(t);

    // ── Layer 3: wood-body thump (≈35 ms) ────────────────────────
    // Pitched sine with instant pitch-drop and fast decay
    const woodHz = (200 + (index % 7) * 22) * pitch;
    const osc    = this.ctx.createOscillator();
    const og     = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(woodHz * 1.6, t);           // start higher
    osc.frequency.exponentialRampToValueAtTime(woodHz, t + 0.006); // settle
    og.gain.setValueAtTime(vel * 0.12, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(og); og.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.038);
  }

  playCapture() {
    if (!this.enabled || !this.ctx) return;
    this._resume();
    const t  = this.ctx.currentTime;
    const sr = this.ctx.sampleRate;
    // Rapid staccato seed drops — like sweeping seeds off the board
    for (let i = 0; i < 5; i++) {
      const dt  = t + i * 0.055;
      const pitch = 0.9 + Math.random() * 0.2;
      // Click
      const cn  = Math.floor(sr * 0.009);
      const cbf = this.ctx.createBuffer(1, cn, sr);
      const cd  = cbf.getChannelData(0);
      for (let j = 0; j < cn; j++) cd[j] = (Math.random() * 2 - 1) * (1 - j / cn);
      const cs = this.ctx.createBufferSource();
      cs.buffer = cbf;
      const hpf = this.ctx.createBiquadFilter();
      hpf.type = 'highpass'; hpf.frequency.value = 2000;
      const cg = this.ctx.createGain(); cg.gain.value = 0.28;
      cs.connect(hpf); hpf.connect(cg); cg.connect(this.ctx.destination);
      cs.start(dt);
      // Ring
      const rn  = Math.floor(sr * 0.04);
      const rbf = this.ctx.createBuffer(1, rn, sr);
      const rd  = rbf.getChannelData(0);
      for (let j = 0; j < rn; j++)
        rd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (rn * 0.14));
      const rs = this.ctx.createBufferSource();
      rs.buffer = rbf;
      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = (380 + i * 40) * pitch;
      bpf.Q.value = 5;
      const rg = this.ctx.createGain(); rg.gain.value = 0.4;
      rs.connect(bpf); bpf.connect(rg); rg.connect(this.ctx.destination);
      rs.start(dt);
    }
    // Ascending metallic chime to signal a successful capture
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const ot  = t + 0.28 + i * 0.09;
      const osc = this.ctx.createOscillator();
      const og  = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      og.gain.setValueAtTime(0, ot);
      og.gain.linearRampToValueAtTime(0.12, ot + 0.015);
      og.gain.exponentialRampToValueAtTime(0.001, ot + 0.35);
      osc.connect(og); og.connect(this.ctx.destination);
      osc.start(ot); osc.stop(ot + 0.37);
    });
  }

  playInvalid() {
    if (!this.enabled || !this.ctx) return;
    this._resume();
    const t   = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
    }
    const source = this.ctx.createBufferSource();
    const gain   = this.ctx.createGain();
    source.buffer = buf;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    source.start(t);
  }

  playVictory() {
    if (!this.enabled || !this.ctx) return;
    this._resume();
    const t = this.ctx.currentTime;
    const melody = [
      { freq: 523.25, delay: 0.00, dur: 0.18 },
      { freq: 659.25, delay: 0.18, dur: 0.18 },
      { freq: 783.99, delay: 0.36, dur: 0.18 },
      { freq: 1046.5, delay: 0.54, dur: 0.45 },
      { freq: 783.99, delay: 0.54, dur: 0.45 },
      { freq: 523.25, delay: 1.05, dur: 0.55 },
    ];
    melody.forEach(({ freq, delay, dur }) => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.18, t + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.05);
    });
  }
}

/* ================================================================
   CONFETTI ENGINE
   ================================================================ */
class ConfettiEngine {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.pieces  = [];
    this.running = false;
    this._raf    = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  launch() {
    this.pieces  = [];
    this.running = true;
    const colors = ['#E85D04','#F48C06','#FFBA08','#D62828','#FFD166','#9B2226','#06D6A0','#118AB2'];
    for (let i = 0; i < 140; i++) {
      this.pieces.push({
        x:     Math.random() * this.canvas.width,
        y:     -20 - Math.random() * 200,
        w:     6 + Math.random() * 8,
        h:     3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx:    (Math.random() - 0.5) * 4,
        vy:    2 + Math.random() * 4,
        rot:   Math.random() * Math.PI * 2,
        vrot:  (Math.random() - 0.5) * 0.2,
        opacity: 1,
      });
    }
    this._loop();
    setTimeout(() => { this.running = false; }, 4500);
  }

  _loop() {
    if (!this.running && this.pieces.length === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.pieces = this.pieces.filter(p => p.opacity > 0.02);
    for (const p of this.pieces) {
      p.x   += p.vx;
      p.y   += p.vy;
      p.rot += p.vrot;
      p.vy  += 0.06;
      if (p.y > this.canvas.height - 50) p.opacity -= 0.025;
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fillStyle   = p.color;
      this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      this.ctx.restore();
    }
    this._raf = requestAnimationFrame(() => this._loop());
  }
}

/* ================================================================
   FLYING SEED ANIMATOR
   ================================================================ */
class SeedAnimator {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.active = [];
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  fly(fromEl, toEl, count, colorIndex, delay = 0) {
    return new Promise(resolve => {
      setTimeout(() => {
        const from     = this._center(fromEl);
        const to       = this._center(toEl);
        const seeds    = [];
        const DURATION = 380;
        const startTime = performance.now();

        const cx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 60;
        const cy = Math.min(from.y, to.y) - 60 - Math.random() * 50;

        for (let i = 0; i < count; i++) {
          seeds.push({
            ox:    (Math.random() - 0.5) * 14,
            oy:    (Math.random() - 0.5) * 14,
            color: this._seedColor(colorIndex + i),
            size:  8 + Math.random() * 4,
          });
        }

        const tick = (now) => {
          const elapsed = now - startTime;
          const t       = Math.min(elapsed / DURATION, 1);
          const ease    = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          const bx = (1 - ease) ** 2 * from.x + 2 * (1 - ease) * ease * cx + ease ** 2 * to.x;
          const by = (1 - ease) ** 2 * from.y + 2 * (1 - ease) * ease * cy + ease ** 2 * to.y;

          for (const s of seeds) {
            const x     = bx + s.ox * (1 - ease);
            const y     = by + s.oy * (1 - ease);
            const alpha = t < 0.85 ? 1 : (1 - t) / 0.15;
            this.ctx.save();
            this.ctx.globalAlpha  = alpha;
            this.ctx.beginPath();
            this.ctx.arc(x, y, s.size / 2, 0, Math.PI * 2);
            this.ctx.fillStyle   = s.color;
            this.ctx.shadowColor = s.color;
            this.ctx.shadowBlur  = 6;
            this.ctx.fill();
            this.ctx.restore();
          }

          if (t < 1) {
            this.active.push({ id: requestAnimationFrame((ts) => {
              this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
              tick(ts);
            }) });
          } else {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            resolve();
          }
        };

        const animId = requestAnimationFrame(tick);
        this.active.push({ id: animId });
      }, delay);
    });
  }

  _seedColor(index) {
    const palette = ['#FF7B29','#FFA833','#FFD166','#FF5B5B','#CC4444','#E8855A'];
    return palette[((index % palette.length) + palette.length) % palette.length];
  }

  clear() {
    this.active.forEach(a => cancelAnimationFrame(a.id));
    this.active = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/* ================================================================
   GAME STATE — True Ayo (Yoruba) Rules
   ================================================================ */
class GameState {
  constructor() {
    this.board         = Array(TOTAL_PITS).fill(SEEDS_PER_PIT);
    this.captured      = [0, 0];   // [p1_captured, p2_captured]
    this.currentPlayer = 1;        // 1 or 2
    this.gameOver      = false;
    this.winner        = null;     // 1, 2, or 0 (tie)
    this.stalemate     = false;
    this._seenStates   = new Set();
    this._seenStates.add(this._stateKey());
  }

  reset() {
    this.board         = Array(TOTAL_PITS).fill(SEEDS_PER_PIT);
    this.captured      = [0, 0];
    this.currentPlayer = 1;
    this.gameOver      = false;
    this.winner        = null;
    this.stalemate     = false;
    this._seenStates   = new Set();
    this._seenStates.add(this._stateKey());
  }

  // Serialise board + whose turn it is → unique position key.
  _stateKey() {
    return this.board.join(',') + '|' + this.currentPlayer;
  }

  _resolveWinner() {
    if      (this.captured[0] > this.captured[1]) this.winner = 1;
    else if (this.captured[1] > this.captured[0]) this.winner = 2;
    else                                            this.winner = 0;
  }

  // Returns valid board indices the player may sow from.
  // Enforces the feed rule: if opponent's side is empty and you can feed,
  // only feeding moves are returned.
  validMoves(player) {
    const myPits  = player === 1 ? P1_PITS : P2_PITS;
    const oppPits = player === 1 ? P2_PITS : P1_PITS;

    const oppTotal = oppPits.reduce((s, i) => s + this.board[i], 0);
    const moves    = myPits.filter(i => this.board[i] > 0);

    if (oppTotal === 0 && moves.length > 0) {
      // Must send seeds to opponent's side (feed rule).
      // Distance from pit i (counter-clockwise) to first opponent pit:
      //   P1→P2: first opp pit is index 6 → dist = 6 - i
      //   P2→P1: first opp pit is index 0 → dist = (12 - i) % 12  (but i is 6-11, so 12-i)
      const feedMoves = moves.filter(i => {
        const dist = player === 1 ? (6 - i) : (12 - i);
        return this.board[i] >= dist;
      });
      return feedMoves; // empty → game over (handled by caller)
    }

    return moves;
  }

  // Sow from boardIdx. Returns result object or null if invalid.
  sow(boardIdx) {
    if (this.gameOver) return null;
    const player = P1_PITS.includes(boardIdx) ? 1 : 2;
    if (player !== this.currentPlayer) return null;
    if (this.board[boardIdx] === 0) return null;

    let seeds = this.board[boardIdx];
    this.board[boardIdx] = 0;

    let pos = boardIdx;
    const sowPath = [];

    while (seeds > 0) {
      pos = (pos + 1) % TOTAL_PITS;
      this.board[pos]++;
      sowPath.push(pos);
      seeds--;
    }

    const lastPos = pos;
    const oppPits = player === 1 ? P2_PITS : P1_PITS;
    const capIdx  = player === 1 ? 0 : 1;   // index into this.captured[]

    // Capture: last seed landed on opponent's side?
    const captures = []; // [{ boardIdx, count }, ...]

    if (oppPits.includes(lastPos)) {
      // Step backwards along opponent's row, capturing pits with exactly 2 or 3 seeds.
      // Sowing is always in the +1 direction (0→1→…→11→0), so "backwards" is always -1.
      // P1 landing at P2's index 8: check 8→7→6 (decreasing within 6-11 range).
      // P2 landing at P1's index 3: check 3→2→1→0 (decreasing within 0-5 range).
      const step     = -1;
      let   checkPos = lastPos;

      while (oppPits.includes(checkPos)) {
        const cnt = this.board[checkPos];
        if (cnt !== 2 && cnt !== 3) break;

        // Grand-slam rule: do NOT capture if it would empty opponent's entire side.
        const remainingElsewhere = oppPits
          .filter(i => i !== checkPos)
          .reduce((s, i) => s + this.board[i], 0);
        if (remainingElsewhere === 0) break;

        captures.push({ boardIdx: checkPos, count: cnt });
        this.captured[capIdx] += cnt;
        this.board[checkPos]   = 0;
        checkPos              += step;
      }
    }

    // Check whether the next player can move.
    const nextPlayer = player === 1 ? 2 : 1;
    const nextMoves  = this.validMoves(nextPlayer);

    if (nextMoves.length === 0) {
      // No moves left — each player claims their own remaining seeds.
      P1_PITS.forEach(i => { this.captured[0] += this.board[i]; this.board[i] = 0; });
      P2_PITS.forEach(i => { this.captured[1] += this.board[i]; this.board[i] = 0; });
      this.gameOver = true;
      this._resolveWinner();
    } else {
      this.currentPlayer = nextPlayer;

      // Stalemate: if this exact position (board + whose turn) has been seen before,
      // the game is deadlocked. Each player keeps their own remaining seeds.
      const key = this._stateKey();
      if (this._seenStates.has(key)) {
        P1_PITS.forEach(i => { this.captured[0] += this.board[i]; this.board[i] = 0; });
        P2_PITS.forEach(i => { this.captured[1] += this.board[i]; this.board[i] = 0; });
        this.gameOver  = true;
        this.stalemate = true;
        this._resolveWinner();
      } else {
        this._seenStates.add(key);
      }
    }

    return {
      player,
      boardIdx,
      sowPath,
      lastPos,
      captures,
      totalCaptured: captures.reduce((s, c) => s + c.count, 0),
      gameOver:  this.gameOver,
      stalemate: this.stalemate,
      p1Score:   this.captured[0],
      p2Score:   this.captured[1],
    };
  }

  clone() {
    const g         = new GameState();
    g.board         = [...this.board];
    g.captured      = [...this.captured];
    g.currentPlayer = this.currentPlayer;
    g.gameOver      = this.gameOver;
    g.winner        = this.winner;
    g.stalemate     = this.stalemate;
    g._seenStates   = new Set(this._seenStates);
    return g;
  }

  getWinner() { return this.winner; }
  score(player) { return this.captured[player - 1]; }
}

/* ================================================================
   AI ENGINE — Ayo-specific strategy
   ================================================================ */
class AIEngine {
  constructor() {
    this.THINK_MS = 800;
  }

  getBestMove(state) {
    const moves = state.validMoves(2);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const scored = moves.map(bi => ({
      bi,
      score: this._scoreMove(state, bi),
    }));
    scored.sort((a, b) => (b.score + Math.random() * 0.5) - (a.score + Math.random() * 0.5));
    return scored[0].bi;
  }

  _scoreMove(state, boardIdx) {
    const clone  = state.clone();
    const result = clone.sow(boardIdx);
    if (!result) return -999;

    let score = 0;

    // Heavily prefer captures.
    score += result.totalCaptured * 4;
    // Extra bonus for chain captures (multiple pits in one move).
    score += result.captures.length * 6;

    // Net gain for P2.
    score += clone.captured[1] - state.captured[1];

    // Penalise if opponent can capture well on the next move.
    if (!clone.gameOver) {
      const oppMoves = clone.validMoves(1);
      let oppBest = 0;
      oppMoves.forEach(oi => {
        const sim = clone.clone();
        const r   = sim.sow(oi);
        if (r) oppBest = Math.max(oppBest, r.totalCaptured);
      });
      score -= oppBest * 2.5;
    }

    // Slight preference for spreading larger pits.
    score += state.board[boardIdx] * 0.2;

    return score;
  }
}

/* ================================================================
   MAIN GAME CONTROLLER
   ================================================================ */
class AyoGame {
  constructor() {
    this.state     = new GameState();
    this.ai        = new AIEngine();
    this.audio     = new AudioEngine();
    this.confetti  = null;
    this.animator  = null;

    this.vsAI      = true;
    this.soundOn   = true;
    this.animating = false;
    this.moveCount = 0;

    this._bindDOM();
    this._initCanvases();
    this._setupMobile();
    this.render();
  }

  /* ---- Mobile: orientation lock + fullscreen ---- */
  _setupMobile() {
    // Ask the browser to lock to landscape (works on Android Chrome)
    if (screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }

    // Enter fullscreen on first touch (browsers require a user gesture)
    const enterFS = () => {
      const el = document.documentElement;
      const req = el.requestFullscreen
               || el.webkitRequestFullscreen
               || el.mozRequestFullScreen;
      if (req) req.call(el).catch(() => {});
    };
    document.addEventListener('touchstart', enterFS, { once: true });

    // Keep fullscreen icon in sync
    const fsBtn  = document.getElementById('btn-fullscreen');
    const fsIcon = fsBtn?.querySelector('.fs-icon');
    const onFSChange = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (fsIcon) fsIcon.textContent = isFS ? '✕' : '⛶';
    };
    document.addEventListener('fullscreenchange',       onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
  }

  /* ---- DOM Binding ---- */
  _bindDOM() {
    this.$board = document.getElementById('board');

    document.getElementById('btn-new-game')
      .addEventListener('click', () => this.newGame());
    document.getElementById('btn-toggle-mode')
      .addEventListener('click', () => this.toggleMode());
    document.getElementById('btn-toggle-sound')
      .addEventListener('click', () => this.toggleSound());
    document.getElementById('btn-play-again')
      .addEventListener('click', () => this.newGame());

    // Help modal
    const helpOverlay = document.getElementById('help-overlay');
    document.getElementById('btn-help')
      .addEventListener('click', () => { helpOverlay.hidden = false; });
    document.getElementById('btn-help-close')
      .addEventListener('click', () => { helpOverlay.hidden = true; });
    helpOverlay.addEventListener('click', e => {
      if (e.target === helpOverlay) helpOverlay.hidden = true;
    });

    // Fullscreen toggle button
    document.getElementById('btn-fullscreen')
      ?.addEventListener('click', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen)
            ?.call(document);
        } else {
          const el  = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          req?.call(el).catch(() => {});
        }
      });

    // P1 pits: visual index i = board index i (0-5)
    P1_PITS.forEach(bi => {
      const el = document.getElementById(`pit-p1-${bi}`);
      el.addEventListener('click',   () => this.onPitClick(bi));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPitClick(bi); }
      });
    });

    // P2 pits: visual index vi = bi - 6
    P2_PITS.forEach(bi => {
      const vi = bi - 6;
      const el = document.getElementById(`pit-p2-${vi}`);
      el.addEventListener('click',   () => this.onPitClick(bi));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPitClick(bi); }
      });
    });
  }

  _initCanvases() {
    this.animator = new SeedAnimator(document.getElementById('fly-canvas'));
    this.confetti = new ConfettiEngine(document.getElementById('confetti-canvas'));
  }

  /* ---- New Game ---- */
  newGame() {
    this.state.reset();
    this.moveCount = 0;
    this.animating = false;
    this.$board.classList.remove('animating');
    document.getElementById('victory-overlay').hidden = true;
    document.getElementById('ai-thinking').hidden     = true;
    document.getElementById('history-list').innerHTML = '';
    this.animator.clear();
    this.render();
  }

  /* ---- Toggle AI/Human ---- */
  toggleMode() {
    this.vsAI = !this.vsAI;
    const btn   = document.getElementById('btn-toggle-mode');
    btn.querySelector('.mode-label').textContent = this.vsAI ? 'vs Ota'   : 'vs Human';
    btn.querySelector('.mode-icon').textContent  = this.vsAI ? '🤖'       : '👥';
    document.getElementById('p2-name').textContent          = this.vsAI ? 'Ota' : 'Player 2';
    document.getElementById('vscore-p2-label').textContent  = this.vsAI ? 'Ota' : 'Player 2';
    this.newGame();
  }

  /* ---- Toggle Sound ---- */
  toggleSound() {
    this.soundOn = !this.soundOn;
    this.audio.enabled = this.soundOn;
    document.querySelector('.sound-icon').textContent = this.soundOn ? '🔊' : '🔇';
  }

  /* ---- Pit Click ---- */
  onPitClick(boardIdx) {
    if (this.animating || this.state.gameOver) return;

    const player = P1_PITS.includes(boardIdx) ? 1 : 2;
    const vi     = player === 1 ? boardIdx : boardIdx - 6;

    if (this.state.currentPlayer !== player) {
      this._shakeInvalid(player, vi);
      this.audio.playInvalid();
      return;
    }

    if (this.vsAI && player === 2) return;

    const valid = this.state.validMoves(player);
    if (!valid.includes(boardIdx)) {
      this._shakeInvalid(player, vi);
      this.audio.playInvalid();
      return;
    }

    this._doMove(boardIdx);
  }

  /* ---- Execute Move (async, with animation) ---- */
  async _doMove(boardIdx) {
    if (this.animating) return;
    this.animating = true;
    this.$board.classList.add('animating');

    // Pre-compute sow path for animation (mirrors GameState.sow logic)
    const seedCount = this.state.board[boardIdx];
    const path = [];
    let pos = boardIdx;
    let s   = seedCount;
    while (s > 0) {
      pos = (pos + 1) % TOTAL_PITS;
      path.push(pos);
      s--;
    }

    await this._animateSow(boardIdx, path);

    const result = this.state.sow(boardIdx);
    if (!result) {
      this.animating = false;
      this.$board.classList.remove('animating');
      return;
    }

    this.moveCount++;

    if (result.captures.length > 0) {
      this._flashCaptures(result.captures);
      this.audio.playCapture();
      this._bounceStore(result.player);
    }

    this._recordHistory(result);
    this.render();

    this.animating = false;
    this.$board.classList.remove('animating');

    if (result.gameOver) {
      setTimeout(() => this._showVictory(), 400);
      return;
    }

    if (this.vsAI && this.state.currentPlayer === 2 && !this.state.gameOver) {
      this._runAITurn();
    }
  }

  /* ---- Animate Seed Sowing ---- */
  async _animateSow(boardIdx, path) {
    const player  = P1_PITS.includes(boardIdx) ? 1 : 2;
    const vi      = player === 1 ? boardIdx : boardIdx - 6;
    const fromEl  = document.getElementById(`pit-p${player}-${vi}`);

    this._highlightPath(path);

    const promises = path.map((bi, i) => {
      const toEl = this._getElementForBoardIndex(bi);
      if (!fromEl || !toEl) return Promise.resolve();
      return this.animator.fly(fromEl, toEl, 1, i, i * 60);
    });

    await Promise.all(promises);

    path.forEach((_, i) => setTimeout(() => this.audio.playSeedDrop(i), i * 60 + 200));

    await new Promise(r => setTimeout(r, path.length * 60 + 250));
    this._clearHighlights();
  }

  /* ---- Board Index → DOM Element ---- */
  _getElementForBoardIndex(bi) {
    if (P1_PITS.includes(bi)) return document.getElementById(`pit-p1-${bi}`);
    if (P2_PITS.includes(bi)) return document.getElementById(`pit-p2-${bi - 6}`);
    return null;
  }

  /* ---- Path Highlighting ---- */
  _highlightPath(path) {
    path.forEach(bi => {
      const el = this._getElementForBoardIndex(bi);
      if (el) el.classList.add('highlight');
    });
  }

  _clearHighlights() {
    document.querySelectorAll('.pit.highlight').forEach(el => el.classList.remove('highlight'));
  }

  /* ---- Chain Capture Flash ---- */
  _flashCaptures(captures) {
    captures.forEach(({ boardIdx }) => {
      const el = this._getElementForBoardIndex(boardIdx);
      if (!el) return;
      el.classList.remove('capture-flash');
      void el.offsetWidth;
      el.classList.add('capture-flash');
      setTimeout(() => el.classList.remove('capture-flash'), 700);
    });
  }

  /* ---- Store Bounce ---- */
  _bounceStore(player) {
    const el = document.getElementById(`store-p${player}-count`);
    if (!el) return;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
    setTimeout(() => el.classList.remove('bounce'), 500);
  }

  /* ---- Invalid Move Shake ---- */
  _shakeInvalid(player, vi) {
    const el = document.getElementById(`pit-p${player}-${vi}`);
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 450);
  }

  /* ---- AI Turn ---- */
  _runAITurn() {
    if (!this.vsAI || this.state.currentPlayer !== 2 || this.state.gameOver) return;
    const thinkEl = document.getElementById('ai-thinking');
    thinkEl.hidden = false;
    setTimeout(() => {
      thinkEl.hidden = true;
      if (this.state.gameOver || this.state.currentPlayer !== 2) return;
      const move = this.ai.getBestMove(this.state);
      if (move !== null) this._doMove(move);
    }, this.ai.THINK_MS);
  }

  /* ---- Move History ---- */
  _recordHistory(result) {
    const { player, boardIdx, captures, totalCaptured } = result;
    const pitLabel = player === 1 ? boardIdx + 1 : boardIdx - 6 + 1;
    const pName    = (player === 2 && this.vsAI) ? 'Ota' : `P${player}`;

    let text    = `${pName} → Pit ${pitLabel}`;
    let classes = `history-item p${player}-move`;

    if (totalCaptured > 0) {
      text += ` ✦ ${totalCaptured} captured`;
      if (captures.length > 1) text += ` (${captures.length} pits)`;
      text   += '!';
      classes += ' capture-move';
    }

    const li  = document.createElement('li');
    li.className   = classes;
    li.textContent = text;

    const list = document.getElementById('history-list');
    list.appendChild(li);

    if (result.stalemate) {
      const sm  = document.createElement('li');
      sm.className   = 'history-item stalemate-event';
      sm.textContent = '🔄 Stalemate — position repeated';
      list.appendChild(sm);
    }

    list.scrollTop = list.scrollHeight;
  }

  /* ---- Victory Screen ---- */
  _showVictory() {
    const winner = this.state.getWinner();
    const p1s    = this.state.captured[0];
    const p2s    = this.state.captured[1];

    document.getElementById('vscore-p1').textContent = p1s;
    document.getElementById('vscore-p2').textContent = p2s;

    const titleEl = document.getElementById('victory-title');
    const emojiEl = document.getElementById('victory-emoji');

    if (this.state.stalemate) {
      emojiEl.textContent = '🔄';
      if (winner === 0)      titleEl.textContent = 'Stalemate — Draw!';
      else if (winner === 1) titleEl.textContent = 'Stalemate — P1 Wins!';
      else                   titleEl.textContent = `Stalemate — ${this.vsAI ? 'Ota' : 'P2'} Wins!`;
    } else if (winner === 0) {
      titleEl.textContent = "It's a Tie!";
      emojiEl.textContent = '🤝';
    } else if (winner === 1) {
      titleEl.textContent = 'Player 1 Wins!';
      emojiEl.textContent = '🏆';
    } else {
      titleEl.textContent = this.vsAI ? 'Ota Wins!' : 'Player 2 Wins!';
      emojiEl.textContent = this.vsAI ? '🤖' : '🏆';
    }

    document.getElementById('victory-overlay').hidden = false;
    this.audio.playVictory();
    if (!this.state.stalemate) this.confetti.launch();
  }

  /* ================================================================
     RENDER
     ================================================================ */
  render() {
    const state = this.state;
    const cp    = state.currentPlayer;

    this.$board.classList.remove('p1-turn', 'p2-turn');
    this.$board.classList.add(`p${cp}-turn`);

    document.getElementById('badge-p1').classList.toggle('active', cp === 1);
    document.getElementById('badge-p2').classList.toggle('active', cp === 2);

    // Status message (includes feed-rule notice)
    const msgEl = document.getElementById('status-message');
    if (state.gameOver) {
      if (state.stalemate) {
        msgEl.textContent = 'Stalemate — position repeated!';
      } else {
        const w = state.getWinner();
        if (w === 0)      msgEl.textContent = "Game Over — It's a Tie!";
        else if (w === 1) msgEl.textContent = 'Game Over — Player 1 Wins!';
        else              msgEl.textContent = `Game Over — ${this.vsAI ? 'Ota' : 'Player 2'} Wins!`;
      }
    } else {
      const oppPits  = cp === 1 ? P2_PITS : P1_PITS;
      const oppEmpty = oppPits.every(i => state.board[i] === 0);
      const pName    = (cp === 2 && this.vsAI) ? 'Ota' : `Player ${cp}`;
      msgEl.textContent = oppEmpty ? `${pName} must feed!` : `${pName}'s Turn`;
    }

    document.getElementById('p2-name').textContent         = this.vsAI ? 'Ota' : 'Player 2';
    document.getElementById('vscore-p2-label').textContent = this.vsAI ? 'Ota' : 'Player 2';

    // Valid moves for highlight logic
    const validMoves = state.gameOver ? [] : state.validMoves(cp);

    // P1 pits (board index = visual index)
    P1_PITS.forEach(bi => {
      const isPlayable = cp === 1 && validMoves.includes(bi) && !state.gameOver;
      this._renderPit('p1', bi, state.board[bi], isPlayable);
    });

    // P2 pits (visual index = bi - 6)
    P2_PITS.forEach(bi => {
      const vi         = bi - 6;
      const isPlayable = cp === 2 && validMoves.includes(bi) && !state.gameOver;
      this._renderPit('p2', vi, state.board[bi], isPlayable);
    });

    // Stores display captured seed counts
    this._renderStore('p1', state.captured[0]);
    this._renderStore('p2', state.captured[1]);
  }

  _renderPit(playerKey, vi, count, isPlayable) {
    const pitEl   = document.getElementById(`pit-${playerKey}-${vi}`);
    const countEl = document.getElementById(`count-${playerKey}-${vi}`);
    const seedsEl = document.getElementById(`seeds-${playerKey}-${vi}`);
    const tipEl   = document.getElementById(`tip-${playerKey}-${vi}`);
    if (!pitEl) return;

    countEl.textContent = count;
    tipEl.textContent   = `${count} seed${count !== 1 ? 's' : ''}`;

    pitEl.classList.toggle('playable', isPlayable);
    pitEl.classList.toggle('empty',    count === 0);

    seedsEl.innerHTML = '';
    if (count > 0) {
      const displayCount = Math.min(count, 16);
      const sizeClass    = count <= 4 ? 'seeds-large' : count <= 9 ? 'seeds-medium' : 'seeds-small';
      seedsEl.className  = `pit-seeds ${sizeClass}`;
      for (let i = 0; i < displayCount; i++) {
        const dot = document.createElement('span');
        dot.className = `seed seed-c${i % 6}`;
        seedsEl.appendChild(dot);
      }
    } else {
      seedsEl.className = 'pit-seeds';
    }

    const label = playerKey === 'p1' ? 'Player 1' : (this.vsAI ? 'Ota' : 'Player 2');
    pitEl.setAttribute('aria-label', `${label} Pit ${vi + 1}: ${count} seeds`);
  }

  _renderStore(playerKey, count) {
    const countEl = document.getElementById(`store-${playerKey}-count`);
    const seedsEl = document.getElementById(`store-${playerKey}-seeds`);
    if (!countEl) return;

    countEl.textContent = count;

    seedsEl.innerHTML = '';
    const displayCount = Math.min(count, 24);
    for (let i = 0; i < displayCount; i++) {
      const dot = document.createElement('span');
      dot.className = `seed seed-c${i % 6}`;
      seedsEl.appendChild(dot);
    }

    const store = document.getElementById(`store-${playerKey}`);
    if (store) {
      const pName = playerKey === 'p1' ? 'Player 1' : (this.vsAI ? 'Ota' : 'Player 2');
      store.setAttribute('aria-label', `${pName} captured: ${count} seeds`);
    }
  }
}

/* ================================================================
   BOOTSTRAP
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  window.ayoGame = new AyoGame();
});
