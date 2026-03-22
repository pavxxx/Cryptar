/* ═══════════════════════════════════════════════════════════
   CryptArithmetic Front-end — app.js
═══════════════════════════════════════════════════════════ */

"use strict";

// ── Global state ──────────────────────────────────────────
const state = {
  // Play tab
  puzzle:     null,   // {words, result, letters, text}
  solution:   null,   // {LETTER: digit}
  mapping:    {},     // user's current mapping
  history:    [],     // undo stack
  hintsUsed:  0,
  score:      1000,
  timerSec:   0,
  timerHandle:null,
  solved:     false,

  // Session stats
  totalSolved: 0,
  streak:      0,

  // AI tab
  aiSteps:       [],
  aiNodeMap:     {},   // node_id -> node obj (for tree)
  aiAnimHandle:  null,
  aiPaused:      false,
  aiStepIdx:     0,
  aiSpeed:       5,
  aiPuzzle:      null,
  aiSolution:    null,
};

// ── DOM refs ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utility ───────────────────────────────────────────────
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}

function setMessage(msg, type = '') {
  const bar = $('message-bar');
  bar.textContent = msg;
  bar.className = `message-bar ${type}`;
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function api(endpoint, opts = {}) {
  const res = await fetch(endpoint, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'ai') initAiTab();
  });
});

// ═══════════════════════════════════════════════════════════
//  PLAY TAB
// ═══════════════════════════════════════════════════════════

async function loadPuzzle(data) {
  // If data not given, fetch from API
  if (!data) data = await api('/api/puzzle');
  if (data.error) { toast('Failed to load puzzle', 'error'); return; }

  state.puzzle   = data;
  state.solution = null;
  state.mapping  = {};
  state.history  = [];
  state.hintsUsed = 0;
  state.score    = 1000;
  state.solved   = false;

  // Fetch solution separately (so we can validate)
  const solRes = await api('/api/solution', {
    method: 'POST',
    body: JSON.stringify({ words: data.words, result: data.result }),
  });
  state.solution = solRes.solution;

  renderPuzzle();
  startTimer();
  setMessage('Game started — assign digits to each letter!');
  $('play-hints').textContent  = 0;
  $('play-score').textContent  = 1000;
  $('play-letters').textContent = data.letters.length;
  updateMappingPreview();
}

function renderPuzzle() {
  const { puzzle } = state;
  $('equation-display').textContent = puzzle.text;

  const grid = $('letter-grid');
  grid.innerHTML = '';

  puzzle.letters.forEach(letter => {
    const card = document.createElement('div');
    card.className = 'letter-card';
    card.id = `lc-${letter}`;

    const lbl = document.createElement('div');
    lbl.className = 'letter-label';
    lbl.textContent = letter;

    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 0; inp.max = 9;
    inp.className = 'letter-input';
    inp.id = `li-${letter}`;
    inp.placeholder = '?';
    inp.addEventListener('change', () => handleMove(letter, inp.value));
    inp.addEventListener('input',  () => {
      if (inp.value.length > 1) inp.value = inp.value.slice(-1);
    });

    const status = document.createElement('div');
    status.className = 'letter-status';
    status.id = `ls-${letter}`;

    card.append(lbl, inp, status);
    grid.appendChild(card);
  });
}

async function handleMove(letter, rawVal) {
  if (rawVal === '' || rawVal === null) {
    delete state.mapping[letter];
    const card = $(`lc-${letter}`);
    if (card) {
      card.classList.remove('correct', 'wrong', 'warn');
      $(`ls-${letter}`).textContent = '';
    }
    updateMappingPreview();
    return;
  }
  const digit = parseInt(rawVal, 10);
  if (isNaN(digit) || digit < 0 || digit > 9) return;

  state.history.push({ ...state.mapping });

  const res = await api('/api/validate', {
    method: 'POST',
    body: JSON.stringify({
      words: state.puzzle.words, result: state.puzzle.result,
      mapping: state.mapping, solution: state.solution,
      letter, digit,
    }),
  });

  const card   = $(`lc-${letter}`);
  const status = $(`ls-${letter}`);
  card.classList.remove('correct', 'wrong', 'warn');

  if (res.status === 'error') {
    card.classList.add('wrong');
    status.textContent = '✗';
    setMessage(res.message, 'error');
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
    // revert input
    $(`li-${letter}`).value = state.mapping[letter] ?? '';
    return;
  }

  state.mapping[letter] = digit;

  if (res.status === 'correct') {
    card.classList.add('correct'); status.textContent = '✓';
    setMessage(res.message, 'success');
  } else if (res.status === 'wrong') {
    card.classList.add('warn'); status.textContent = '?';
    setMessage(res.message, 'warn');
    state.score = Math.max(0, state.score - 50);
    $('play-score').textContent = state.score;
  } else {
    status.textContent = '…';
    setMessage(res.message);
  }

  updateMappingPreview();
  checkPuzzleComplete();
}

function checkPuzzleComplete() {
  const { puzzle, mapping, solution } = state;
  if (!solution) return;
  if (puzzle.letters.every(l => mapping[l] !== undefined && mapping[l] === solution[l])) {
    celebrateSolve();
  }
}

function celebrateSolve() {
  state.solved = true;
  stopTimer();
  state.totalSolved++;
  state.streak++;
  $('h-solved').textContent = state.totalSolved;
  $('h-streak').textContent = state.streak;
  setMessage('🎉 Puzzle Solved! Congratulations!', 'success');
  toast('🎉 Excellent! Puzzle solved!', 'success');
  spawnConfetti();
}

function updateMappingPreview() {
  const prev = $('mapping-preview');
  prev.innerHTML = '';
  Object.entries(state.mapping).forEach(([l, d]) => {
    const chip = document.createElement('div');
    const sol = state.solution;
    const correct = sol && sol[l] === d;
    chip.className = `mp-chip ${correct ? 'correct' : ''}`;
    chip.textContent = `${l}=${d}`;
    prev.appendChild(chip);
  });
}

// Timer
function startTimer() {
  stopTimer();
  state.timerSec = 0;
  $('play-timer').textContent = '00:00';
  state.timerHandle = setInterval(() => {
    if (state.solved) return;
    state.timerSec++;
    $('play-timer').textContent = formatTime(state.timerSec);
  }, 1000);
}
function stopTimer() { clearInterval(state.timerHandle); }

// Hint
$('btn-hint').addEventListener('click', async () => {
  if (!state.puzzle || state.solved) return;
  const res = await api('/api/hint', {
    method: 'POST',
    body: JSON.stringify({
      solution: state.solution, mapping: state.mapping,
      letters: state.puzzle.letters,
    }),
  });
  if (res.letter !== undefined) {
    state.history.push({ ...state.mapping });
    state.mapping[res.letter] = res.digit;
    const inp = $(`li-${res.letter}`);
    if (inp) { inp.value = res.digit; }
    const card = $(`lc-${res.letter}`);
    if (card) {
      card.classList.remove('wrong','warn');
      card.classList.add('correct');
      $(`ls-${res.letter}`).textContent = '✓';
    }
    state.hintsUsed++;
    state.score = Math.max(0, state.score - 100);
    $('play-hints').textContent = state.hintsUsed;
    $('play-score').textContent = state.score;
    setMessage(res.message, 'success');
    updateMappingPreview();
    checkPuzzleComplete();
  }
  toast(res.message || 'No more hints available!');
});

// Undo
$('btn-undo').addEventListener('click', () => {
  if (!state.history.length) { toast('Nothing to undo'); return; }
  state.mapping = state.history.pop();
  // Re-render inputs from mapping
  state.puzzle.letters.forEach(l => {
    const inp  = $(`li-${l}`);
    const card = $(`lc-${l}`);
    const st   = $(`ls-${l}`);
    if (!inp) return;
    const d = state.mapping[l];
    inp.value = d !== undefined ? d : '';
    card.classList.remove('correct','wrong','warn');
    if (d !== undefined && state.solution && state.solution[l] === d) {
      card.classList.add('correct'); st.textContent = '✓';
    } else { st.textContent = ''; }
  });
  setMessage('↩ Move undone');
  updateMappingPreview();
});

// Check all
$('btn-check').addEventListener('click', () => {
  if (!state.puzzle) return;
  
  let allFilled = true;
  let allCorrect = true;

  state.puzzle.letters.forEach(l => {
    const val = $(`li-${l}`).value;
    if (val === '') {
      allFilled = false;
    } else if (state.solution && parseInt(val, 10) !== state.solution[l]) {
      allCorrect = false;
    }
  });

  if (!allFilled) { 
    toast('⚠ Fill in all letters first!', 'error'); 
    return; 
  }

  if (allCorrect) {
    if (!state.solved) celebrateSolve();
  } else {
    toast('Some assignments are incorrect. Keep trying!', 'error');
    setMessage('Puzzle is not solved yet. Look for red/yellow warnings.', 'error');
    const btn = $('btn-check');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
  }
});

// New puzzle
$('btn-new').addEventListener('click', () => { state.streak = 0; $('h-streak').textContent = 0; loadPuzzle(); });

// Custom puzzle
$('btn-custom').addEventListener('click', () => {
  $('modal-custom').classList.add('open');
  $('custom-input').focus();
});
$('modal-close').addEventListener('click', closeModal);
$('btn-modal-cancel').addEventListener('click', closeModal);
$('modal-custom').addEventListener('click', e => { if (e.target === $('modal-custom')) closeModal(); });
function closeModal() { $('modal-custom').classList.remove('open'); }

$('btn-modal-load').addEventListener('click', () => {
  const raw   = $('custom-input').value.trim().toUpperCase();
  const errEl = $('custom-error');
  errEl.textContent = '';
  if (!raw.includes('=') || !raw.includes('+')) {
    errEl.textContent = 'Invalid format. Use WORD1 + WORD2 = RESULT'; return;
  }
  const [lhs, result] = raw.split('=').map(s => s.trim());
  const words = lhs.split('+').map(s => s.trim());
  if (words.some(w => !w) || !result) { errEl.textContent = 'Incomplete puzzle'; return; }
  const letters = [...new Set((words.join('') + result).split(''))];
  if (letters.length > 10) { errEl.textContent = 'Too many unique letters (max 10)'; return; }
  if (!/^[A-Z]+$/.test(words.join('') + result)) { errEl.textContent = 'Use uppercase letters only'; return; }
  closeModal();
  loadPuzzle({ words, result, letters, text: `${words.join(' + ')} = ${result}`, name: raw });
});

// ═══════════════════════════════════════════════════════════
//  AI LEARNER TAB
// ═══════════════════════════════════════════════════════════

let presetsLoaded = false;
async function initAiTab() {
  if (presetsLoaded) return;
  presetsLoaded = true;
  const presets = await api('/api/presets');
  const sel = $('ai-puzzle-select');
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel._presets = presets;
  
  if (presets.length > 0) {
    state.aiPuzzle = presets[0];
    $('ai-equation-display').textContent = presets[0].text;
  }
}

$('btn-ai-random').addEventListener('click', async () => {
  const data = await api('/api/puzzle');
  if (data.error) { toast('Could not generate puzzle', 'error'); return; }
  state.aiPuzzle = data;
  $('ai-equation-display').textContent = data.text;
  clearAiState();
});

$('ai-puzzle-select').addEventListener('change', function () {
  const presets = this._presets;
  if (!presets) return;
  const p = presets[+this.value];
  state.aiPuzzle = p;
  $('ai-equation-display').textContent = p.text;
  clearAiState();
});

function clearAiState() {
  stopAi();
  state.aiSteps   = [];
  state.aiStepIdx = 0;
  state.aiNodeMap = {};
  $('ai-step-cur').textContent   = 0;
  $('ai-step-total').textContent = 0;
  $('ai-step-msg').textContent   = '—';
  $('ai-progress-fill').style.width = '0%';
  $('ai-mapping-table').innerHTML  = '';
  $('step-log').innerHTML          = '';
  $('tree-placeholder').style.display = 'flex';
  treeRenderer.clear();
}

$('btn-ai-start').addEventListener('click', async () => {
  if (!state.aiPuzzle) { toast('Select a puzzle first', 'error'); return; }
  if (state.aiSteps.length === 0) {
    // Fetch steps
    toast('Loading AI solver…');
    const res = await api('/api/solve', {
      method: 'POST',
      body: JSON.stringify({
        words:     state.aiPuzzle.words,
        result:    state.aiPuzzle.result,
        max_steps: 600,
      }),
    });
    if (!res.steps || !res.steps.length) { toast('Could not solve puzzle', 'error'); return; }
    state.aiSteps   = res.steps;
    state.aiSolution = res.solution;
    state.aiStepIdx = 0;
    $('ai-step-total').textContent = res.total_steps;
    // Pre-build tree layout
    treeRenderer.build(res.steps);
    $('tree-placeholder').style.display = 'none';
    if (res.truncated) toast(`Showing first 2000 steps of a longer search`);
  }
  state.aiPaused = false;
  $('btn-ai-pause').disabled = false;
  $('btn-ai-start').disabled = true;
  runAiAnimation();
});

$('btn-ai-pause').addEventListener('click', () => {
  if (!state.aiPaused) {
    state.aiPaused = true;
    clearTimeout(state.aiAnimHandle);
    $('btn-ai-pause').textContent = '▶ Resume';
  } else {
    state.aiPaused = false;
    $('btn-ai-pause').textContent = '⏸ Pause';
    runAiAnimation();
  }
});

$('btn-ai-reset').addEventListener('click', () => {
  if (!state.aiPuzzle) return;
  clearAiState();
  $('btn-ai-start').disabled  = false;
  $('btn-ai-pause').disabled  = true;
  $('btn-ai-pause').textContent = '⏸ Pause';
});

$('speed-slider').addEventListener('input', function () {
  state.aiSpeed = +this.value;
});

function stopAi() {
  state.aiPaused = true;
  clearTimeout(state.aiAnimHandle);
}

function runAiAnimation() {
  if (state.aiPaused) return;
  if (state.aiStepIdx >= state.aiSteps.length) {
    $('btn-ai-start').disabled  = false;
    $('btn-ai-pause').disabled  = true;
    toast('AI solver finished!', 'success');
    return;
  }

  const step = state.aiSteps[state.aiStepIdx];
  processAiStep(step, state.aiStepIdx);
  state.aiStepIdx++;

  // Exponentional speed scale: 1=Slowest (800ms) to 10=Fastest (0ms/Instant)
  const delays = [800, 500, 300, 180, 100, 50, 25, 10, 2, 0];
  const delay = delays[state.aiSpeed - 1] ?? 100;
  
  state.aiAnimHandle = setTimeout(runAiAnimation, delay);
}

function processAiStep(step, idx) {
  const total = state.aiSteps.length;
  $('ai-step-cur').textContent      = idx + 1;
  $('ai-step-msg').textContent      = step.message;
  $('ai-progress-fill').style.width = `${((idx + 1) / total * 100).toFixed(1)}%`;

  // Mapping table
  renderAiMapping(step.mapping, step.letter, step.type);

  // Step log
  addLogEntry(step, idx);

  // Highlight node in tree
  treeRenderer.highlightStep(idx);
}

function renderAiMapping(mapping, activeLetter, type) {
  if (!state.aiPuzzle) return;
  const table = $('ai-mapping-table');
  table.innerHTML = '';
  const allLetters = state.aiPuzzle.letters || Object.keys(mapping);
  allLetters.forEach(l => {
    const chip = document.createElement('div');
    const assigned = mapping[l] !== undefined;
    let cls = 'am-chip';
    if (l === activeLetter) cls += type === 'backtrack' ? ' bt' : ' active';
    else if (assigned) cls += ' done';
    chip.className = cls;

    const lDiv = document.createElement('div'); lDiv.className = 'am-letter'; lDiv.textContent = l;
    const dDiv = document.createElement('div'); dDiv.className = 'am-digit';
    dDiv.textContent = assigned ? mapping[l] : '?';

    chip.append(lDiv, dDiv);
    table.appendChild(chip);
  });
}

function addLogEntry(step, idx) {
  const log  = $('step-log');
  const entry = document.createElement('div');
  // Only keep last 80 entries for performance
  while (log.children.length > 79) log.removeChild(log.firstChild);

  // Remove previous 'current' class
  log.querySelectorAll('.current').forEach(e => e.classList.remove('current'));

  entry.className = `log-entry ${step.type} current`;
  entry.textContent = `[${String(idx + 1).padStart(3,' ')}] ${step.message}`;
  log.appendChild(entry);
  entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Tree fit / reset view
$('btn-tree-fit').addEventListener('click', () => treeRenderer.fitView());
$('btn-tree-reset-view').addEventListener('click', () => treeRenderer.resetView());

// ═══════════════════════════════════════════════════════════
//  TREE RENDERER
// ═══════════════════════════════════════════════════════════

class TreeRenderer {
  constructor() {
    this.canvas = $('tree-canvas');
    this.ctx    = this.canvas.getContext('2d');
    this.nodes  = [];          // ordered list
    this.nodeMap = {};         // id → node
    this.currentIdx = -1;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.isDragging = false;
    this.dragStart  = { x: 0, y: 0 };
    this._setupEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const wrap = $('tree-canvas-wrap');
    this.canvas.width  = wrap.clientWidth  || 600;
    this.canvas.height = wrap.clientHeight || 420;
    this.render();
  }

  _setupEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
    });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.transform.x = e.clientX - this.dragStart.x;
      this.transform.y = e.clientY - this.dragStart.y;
      this.render();
    });
    c.addEventListener('mouseup',  () => { this.isDragging = false; });
    c.addEventListener('mouseleave', () => { this.isDragging = false; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.transform.x = mx - (mx - this.transform.x) * factor;
      this.transform.y = my - (my - this.transform.y) * factor;
      this.transform.scale *= factor;
      this.render();
    }, { passive: false });
  }

  build(steps) {
    this.nodes  = [];
    this.nodeMap = {};
    this.currentIdx = -1;

    // Create node objects
    steps.forEach(step => {
      const node = {
        id: step.node_id, parentId: step.parent_id,
        type: step.type, letter: step.letter, digit: step.digit,
        depth: step.depth, message: step.message,
        children: [], parent: null,
        x: 0, y: 0, visible: false, isCurrent: false,
      };
      this.nodeMap[node.id] = node;
      this.nodes.push(node);
    });

    // Link parents
    this.nodes.forEach(node => {
      if (node.parentId && this.nodeMap[node.parentId]) {
        const par = this.nodeMap[node.parentId];
        par.children.push(node);
        node.parent = par;
      }
    });

    // Layout
    const root = this.nodes.find(n => !n.parent);
    if (root) {
      const xOff = [0];
      this._layout(root, xOff);
      this._centerTree();
    }

    // Smart initial view: centre on root at comfortable zoom.
    // Don't fitView here — tree might be huge; let user press Fit.
    const rootNode = this.nodes.find(n => !n.parent);
    if (rootNode) {
      // Scale based on total node count: fewer nodes = larger zoom
      const nodeCount  = this.nodes.length;
      const initScale  = Math.min(1.6, Math.max(0.55, 80 / (nodeCount + 10)));
      this.transform.scale = initScale;
      this.transform.x     = this.canvas.width  / 2 - rootNode.x * initScale;
      this.transform.y     = 30;
    }
    this.render();
  }

  _layout(node, xOff) {
    const H = 100, W = 72;     // was 70 / 46 — much more breathing room
    if (node.children.length === 0) {
      node.x = xOff[0] * W; xOff[0]++;
    } else {
      node.children.forEach(c => this._layout(c, xOff));
      const first = node.children[0];
      const last  = node.children[node.children.length - 1];
      node.x = (first.x + last.x) / 2;
    }
    node.y = node.depth * H + 50;   // extra top margin
  }

  _centerTree() {
    if (!this.nodes.length) return;
    const xs = this.nodes.map(n => n.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cw  = this.canvas.width / 2;
    this.nodes.forEach(n => { n.x = n.x - mid + cw; });
  }

  fitView() {
    // Fit to VISIBLE nodes, falling back to all nodes
    const pool = this.nodes.filter(n => n.visible);
    const src  = pool.length > 0 ? pool : this.nodes;
    if (!src.length) return;
    const pad  = 50;
    const xs   = src.map(n => n.x);
    const ys   = src.map(n => n.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const tw   = maxX - minX, th = maxY - minY;
    const scale = Math.min(
      this.canvas.width  / tw,
      this.canvas.height / th,
      1.8   // never scale up beyond 1.8×
    );
    this.transform.scale = scale;
    this.transform.x = -minX * scale + (this.canvas.width  - tw * scale) / 2;
    this.transform.y = -minY * scale + (this.canvas.height - th * scale) / 2;
    this.render();
  }

  resetView() {
    this.transform = { x: 0, y: 0, scale: 1 };
    this.render();
  }

  highlightStep(idx) {
    if (idx < 0 || idx >= this.nodes.length) return;
    this.nodes.forEach(n => { n.isCurrent = false; });
    const node = this.nodes[idx];
    if (node) {
      node.visible = true;
      node.isCurrent = true;
      this.currentIdx = idx;
      // Also show parent chain
      let cur = node.parent;
      while (cur) { cur.visible = true; cur = cur.parent; }
    }
    this.render();
  }

  clear() {
    this.nodes   = [];
    this.nodeMap = {};
    this.currentIdx = -1;
    this.render();
  }

  _color(type) {
    switch (type) {
      case 'start':     return '#c084fc';   /* vivid violet        */
      case 'assign':    return '#00c9a7';   /* electric teal       */
      case 'backtrack': return '#f43f5e';   /* rose-red            */
      case 'success':   return '#4ade80';   /* bright lime green   */
      default:          return '#64748b';
    }
  }

  render() {
    const { ctx, canvas, transform: t } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.nodes.length) return;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);

    const R_BASE    = 26;   // idle node radius   (was 18)
    const R_CURRENT = 33;   // active node radius (was 22)

    // ── Edges ──────────────────────────────────────────────
    this.nodes.forEach(node => {
      if (!node.visible || !node.parent || !node.parent.visible) return;
      const p = node.parent;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(node.x, node.y);
      if (node.isCurrent) {
        ctx.strokeStyle = this._color(node.type);
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = this._color(node.type);
        ctx.shadowBlur  = 8;
      } else {
        ctx.strokeStyle = 'rgba(180,195,220,0.18)';
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // ── Nodes ───────────────────────────────────────────────
    this.nodes.forEach(node => {
      if (!node.visible) return;
      const r     = node.isCurrent ? R_CURRENT : R_BASE;
      const color = this._color(node.type);

      // Outer glow for current node
      if (node.isCurrent) {
        const glowR = r + 18;
        const g = ctx.createRadialGradient(node.x, node.y, r - 4, node.x, node.y, glowR);
        g.addColorStop(0, color + '66');
        g.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Node fill — active is solid, others slightly transparent
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

      if (node.isCurrent) {
        // Radial gradient fill for active node
        const grad = ctx.createRadialGradient(node.x - r * 0.3, node.y - r * 0.3, r * 0.1,
                                              node.x,              node.y,              r);
        grad.addColorStop(0, color + 'ff');
        grad.addColorStop(1, color + 'bb');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = color + '99';
      }
      ctx.fill();

      // Border ring
      ctx.strokeStyle = node.isCurrent ? '#ffffff55' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth   = node.isCurrent ? 2 : 1.2;
      ctx.stroke();

      // ── Digit / symbol label ────────────────────────────
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(r * 0.62)}px "JetBrains Mono",monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      let label = '';
      if (node.type === 'start')      label = 'S';
      else if (node.type === 'success')   label = '✓';
      else if (node.type === 'backtrack') label = '↩';
      else label = (node.digit !== null && node.digit !== undefined) ? String(node.digit) : '?';
      ctx.shadowColor = node.isCurrent ? color : 'transparent';
      ctx.shadowBlur  = node.isCurrent ? 6 : 0;
      ctx.fillText(label, node.x, node.y);
      ctx.shadowBlur = 0;

      // ── Letter above node ──────────────────────────────
      if (node.letter) {
        ctx.fillStyle = node.isCurrent ? '#fff' : 'rgba(240,244,255,0.6)';
        ctx.font      = `bold ${node.isCurrent ? 13 : 11}px "Space Grotesk",sans-serif`;
        ctx.fillText(node.letter, node.x, node.y - r - 9);
      }
    });

    ctx.restore();
  }
}

const treeRenderer = new TreeRenderer();

// ═══════════════════════════════════════════════════════════
//  CONFETTI
// ═══════════════════════════════════════════════════════════

function spawnConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ff6b35','#00c9a7','#4ade80','#facc15','#f43f5e','#c084fc'];
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    r: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * 360,
    spin: (Math.random() - 0.5) * 6,
    alpha: 1,
  }));
  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.06;
      p.alpha -= 0.006;
      if (p.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.5);
      ctx.restore();
    });
    if (particles.some(p => p.alpha > 0)) frame = requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); cancelAnimationFrame(frame); }
  }
  draw();
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  loadPuzzle();
});
